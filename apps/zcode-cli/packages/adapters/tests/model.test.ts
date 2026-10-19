import { describe, expect, it, vi } from "vitest";
import {
  ModelErrorCode,
  ModelFailureReason,
  ModelProtocolError,
  createModelId,
  createModelProviderId,
  type ModelEvent,
  type ModelProperties,
} from "@zcode/contracts";
import {
  createModel as createRawModel,
  type ModelExecutionRequest,
  type ModelExecutor,
} from "../src/model/model.js";
import {
  TestAiSdkModelAdapter as AiSdkModelAdapter,
  TestProviderConfigFixture,
} from "./test-provider-config.js";
import type { AiSdkModelRuntime } from "../src/model/runner-runtime.js";
import { createTestInputFormat } from "./test-model-format.js";

const properties: ModelProperties = {
  requiresMfjsToolSchema: false,
  contextWindow: 128_000,
  inputFormat: {
    supportsText: true,
    supportsImage: true,
    supportsVideo: false,
    supportsAudio: false,
    supportsPdf: false,
  },
  outputFormat: { supportsText: true },
  supportsMidConversationSystem: false,
  supportsNativeWebSearch: false,
  supportsJsonSchemaOutput: true,
  supportsToolCall: true,
};

function createExecutor() {
  const requests: ModelExecutionRequest[] = [];
  const generateText = vi.fn(async (request: ModelExecutionRequest) => {
    requests.push(request);
    return {
      finishReason: "stop",
      providerId: createModelProviderId("test"),
      modelId: createModelId("model-a"),
      text: "done",
      usage: {},
    };
  });
  const executor: ModelExecutor = {
    generateText,
    async *streamText(): AsyncIterable<ModelEvent> {
      yield { type: "start" };
      yield { type: "finish", finishReason: "stop", usage: {} };
    },
  };
  return { executor, generateText, requests };
}

/** 测试夹具必须显式绑定执行预算，不能借已删除的 Option Spec default 偷渡请求值。 */
function createModel(input: Parameters<typeof createRawModel>[0]) {
  const reasoningLevel = input.optionSpecs.reasoningLevel ?? {
    values: ["disabled"],
  };
  return createRawModel({
    ...input,
    optionSpecs: {
      ...input.optionSpecs,
      reasoningLevel,
    },
    options: input.options ?? {
      maxOutputTokens: Math.min(8_000, input.optionSpecs.maxOutputTokens.max),
      reasoningLevel: reasoningLevel.values.at(-1) ?? "disabled",
    },
  });
}

describe("Model", () => {
  it("applies bound and request options without mutation", async () => {
    const { executor, requests } = createExecutor();
    const base = createModel({
      executor,
      modelId: "model-a",
      optionSpecs: {
        maxOutputTokens: { max: 128_000 },
        reasoningLevel: {
          values: ["low", "medium", "high"],
        },
      },
      properties,
      providerId: "test",
    });

    const bound = base.bind({ maxOutputTokens: 16_000, reasoningLevel: "high" });
    await bound.generateText({
      messages: [{ role: "user", content: "hello" }],
      options: { maxOutputTokens: 4_000, reasoningLevel: "low" },
    });

    expect(base.options).toEqual({ maxOutputTokens: 8_000, reasoningLevel: "high" });
    expect(bound.options).toEqual({ maxOutputTokens: 16_000, reasoningLevel: "high" });
    expect(requests[0]?.options).toEqual({
      maxOutputTokens: 4_000,
      reasoningLevel: "low",
    });
  });

  it("rejects a request without an explicit max output budget", async () => {
    const { executor } = createExecutor();
    const model = createRawModel({
      executor,
      modelId: "model-a",
      optionSpecs: {
        maxOutputTokens: { max: 16_000 },
        reasoningLevel: { values: ["disabled"] },
      },
      properties,
      providerId: "test",
    });

    await expect(
      model.generateText({ messages: [{ role: "user", content: "hello" }] }),
    ).rejects.toMatchObject({ code: ModelErrorCode.InvalidModelRequest });
  });

  it("validates option enum and limit constraints at bind and request boundaries", async () => {
    const { executor } = createExecutor();
    const model = createModel({
      executor,
      modelId: "model-a",
      optionSpecs: {
        maxOutputTokens: { max: 16_000 },
        reasoningLevel: { values: ["low", "high"] },
      },
      properties,
      providerId: "test",
    });

    expect(() => model.bind({ reasoningLevel: "unsupported" })).toThrowError(ModelProtocolError);
    await expect(
      model.generateText({
        messages: [{ role: "user", content: "hello" }],
        options: { maxOutputTokens: 4_000 },
      }),
    ).resolves.toMatchObject({ text: "done" });
    for (const maxOutputTokens of [0, -1, 1.5]) {
      await expect(
        model.generateText({
          messages: [{ role: "user", content: "hello" }],
          options: { maxOutputTokens },
        }),
      ).rejects.toMatchObject({
        code: ModelErrorCode.InvalidModelRequest,
        context: {
          reason: ModelFailureReason.InvalidRequest,
          retryable: false,
          source: "runtime",
        },
      });
    }
    await expect(
      model.generateText({
        messages: [{ role: "user", content: "hello" }],
        options: { maxOutputTokens: 32_000 },
      }),
    ).rejects.toMatchObject({
      code: ModelErrorCode.InvalidModelRequest,
      context: {
        reason: ModelFailureReason.InvalidRequest,
        retryable: false,
        source: "runtime",
      },
    });
  });

  it("validates request features against model properties before execution", async () => {
    const { executor, generateText } = createExecutor();
    const model = createModel({
      executor,
      modelId: "model-a",
      optionSpecs: {
        maxOutputTokens: { max: 8_000 },
      },
      properties: {
        ...properties,
        inputFormat: {
          ...properties.inputFormat,
          supportsImage: false,
          supportsVideo: false,
        },
        supportsJsonSchemaOutput: false,
        supportsToolCall: false,
      },
      providerId: "test",
    });

    await expect(
      model.generateText({
        messages: [{ role: "user", content: "hello" }],
        tools: [{ name: "Read", inputSchema: { type: "object" } }],
      }),
    ).rejects.toMatchObject({
      code: ModelErrorCode.InvalidModelRequest,
      context: {
        reason: ModelFailureReason.InvalidRequest,
        retryable: false,
        source: "runtime",
      },
    });
    await expect(
      model.generateText({
        messages: [{ role: "user", content: "hello" }],
        responseJsonSchema: { type: "object" },
      }),
    ).rejects.toMatchObject({
      code: ModelErrorCode.InvalidModelRequest,
      context: {
        reason: ModelFailureReason.InvalidRequest,
        retryable: false,
        source: "runtime",
      },
    });
    await expect(
      model.generateText({
        messages: [
          {
            role: "user",
            content: [
              { type: "image", dataUrl: "data:image/png;base64,AA==", mediaType: "image/png" },
            ],
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: ModelErrorCode.InvalidModelRequest,
      context: {
        reason: ModelFailureReason.InvalidRequest,
        retryable: false,
        source: "runtime",
      },
    });
    await expect(
      model.generateText({
        messages: [
          {
            role: "user",
            content: [
              {
                type: "file",
                dataUrl: "data:video/mp4;base64,AA==",
                mediaType: "video/mp4",
              },
            ],
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: ModelErrorCode.InvalidModelRequest,
      context: {
        reason: ModelFailureReason.InvalidRequest,
        retryable: false,
        source: "runtime",
      },
    });
    expect(generateText).not.toHaveBeenCalled();
  });

  it("allows media input when the model properties explicitly support it", async () => {
    const { executor, generateText } = createExecutor();
    const model = createModel({
      executor,
      modelId: "model-a",
      optionSpecs: {
        maxOutputTokens: { max: 8_000 },
      },
      properties: {
        ...properties,
        inputFormat: createTestInputFormat(),
      },
      providerId: "test",
    });

    await model.generateText({
      messages: [
        {
          role: "user",
          content: [
            { type: "image", dataUrl: "data:image/png;base64,AA==", mediaType: "image/png" },
            {
              type: "file",
              dataUrl: "data:application/pdf;base64,AA==",
              mediaType: "application/pdf",
            },
          ],
        },
      ],
    });

    expect(generateText).toHaveBeenCalledOnce();
  });

  it("keeps the resolved provider model stable after registry replacement", async () => {
    const firstLanguageModel = { specificationVersion: "v3", provider: "first", modelId: "a" };
    const secondLanguageModel = { specificationVersion: "v3", provider: "second", modelId: "a" };
    const receivedModels: unknown[] = [];
    const runtime: AiSdkModelRuntime = {
      async generateText(options) {
        receivedModels.push(options.model);
        return {
          finishReason: "stop",
          text: "done",
          totalUsage: {},
          usage: {},
        } as never;
      },
      streamText() {
        throw new Error("not used");
      },
    };
    const registry = new TestProviderConfigFixture({
      providers: {
        test: {
          kind: "custom",
          createLanguageModel: () => firstLanguageModel as never,
        },
      },
    });
    const adapter = new AiSdkModelAdapter({ registry, runtime });
    const model = adapter.createModel({
      providerId: "test" as never,
      modelId: "model-a" as never,
      optionSpecs: {
        maxOutputTokens: { max: 8_000 },
      },
      properties,
    });

    registry.replaceConfig({
      providers: {
        test: {
          kind: "custom",
          createLanguageModel: () => secondLanguageModel as never,
        },
      },
    });
    await model.generateText({ messages: [{ role: "user", content: "hello" }] });

    expect((receivedModels[0] as { modelId?: string }).modelId).toBe("model-a");
  });

  it("binds Provider headers without exposing them on Model", async () => {
    const receivedHeaders: unknown[] = [];
    const runtime: AiSdkModelRuntime = {
      async generateText(options) {
        receivedHeaders.push(options.headers);
        return {
          finishReason: "stop",
          text: "done",
          totalUsage: {},
          usage: {},
        } as never;
      },
      streamText() {
        throw new Error("not used");
      },
    };
    const adapter = new AiSdkModelAdapter({
      registry: new TestProviderConfigFixture({
        providers: {
          test: {
            kind: "custom",
            headers: { "X-Provider": "yes", "X-Shared": "provider" },
            createLanguageModel: () =>
              ({ specificationVersion: "v3", provider: "test", modelId: "a" }) as never,
          },
        },
      }),
      runtime,
    });
    const model = adapter.createModel({
      providerId: "test" as never,
      modelId: "model-a" as never,
      optionSpecs: {
        maxOutputTokens: { max: 8_000 },
      },
      properties,
    });

    await model.generateText({ messages: [{ role: "user", content: "hello" }] });

    expect(receivedHeaders[0]).toMatchObject({
      "X-Provider": "yes",
      "X-Shared": "provider",
    });
    expect(model).not.toHaveProperty("headers");
  });

  it("does not duplicate effective model options into AI SDK provider options", async () => {
    let receivedProviderOptions: unknown;
    let receivedMaxOutputTokens: unknown;
    const runtime: AiSdkModelRuntime = {
      async generateText(options) {
        receivedProviderOptions = options.providerOptions;
        receivedMaxOutputTokens = options.maxOutputTokens;
        return {
          finishReason: "stop",
          text: "done",
          totalUsage: {},
          usage: {},
        } as never;
      },
      streamText() {
        throw new Error("not used");
      },
    };
    const adapter = new AiSdkModelAdapter({
      registry: new TestProviderConfigFixture({
        providers: {
          test: {
            kind: "custom",
            createLanguageModel: () =>
              ({ specificationVersion: "v3", provider: "test", modelId: "a" }) as never,
          },
        },
      }),
      runtime,
    });
    const model = adapter
      .createModel({
        providerId: "test" as never,
        modelId: "model-a" as never,
        optionSpecs: {
          maxOutputTokens: {
            max: 16_000,
            map: '{"max_completion_tokens":maxOutputTokens}',
          },
          reasoningLevel: {
            values: ["low", "high"],
            map: '{"reasoning_effort":reasoningLevel}',
          },
        },
        properties,
      })
      .bind({ reasoningLevel: "high" });

    await model.generateText({
      messages: [{ role: "user", content: "hello" }],
      options: { maxOutputTokens: 4_000 },
    });

    expect(receivedProviderOptions).toEqual({
      apiFormat: "openai-chat-completions",
    });
    expect(receivedMaxOutputTokens).toBeUndefined();
  });

  it("accepts reasoning and total output options independently", async () => {
    const { executor, requests } = createExecutor();
    const model = createModel({
      executor,
      modelId: "model-a",
      optionSpecs: {
        maxOutputTokens: { max: 64_000 },
        reasoningLevel: { values: ["low", "high"] },
      },
      properties,
      providerId: "test",
    });

    await model.generateText({
      messages: [{ role: "user", content: "hello" }],
      options: { maxOutputTokens: 4_000, reasoningLevel: "high" },
    });

    expect(requests[0]?.options).toEqual({
      maxOutputTokens: 4_000,
      reasoningLevel: "high",
    });
  });
});

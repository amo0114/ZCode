import { APICallError } from "ai";
import { afterEach, describe, expect, it } from "vitest";
import { TOOL_SEARCH_BETA } from "@zcode/contracts";
import {
  ApiKeyAccessConfig,
  ModelConfig,
  ModelInputFormatConfig,
  ModelOptionSpecsConfig,
  ModelOutputFormatConfig,
  ModelPropertiesConfig,
  ProviderApiConfig,
  ProviderConfig,
  type RegistryModelConfig,
  type RegistryProviderConfig,
} from "@zcode/provider";
import { AiSdkModelAdapter } from "../src/model/runner.js";
import type { AiSdkModelRuntime } from "../src/model/runner-runtime.js";
import {
  isNativeToolSearchRejection,
  markNativeToolSearchRejected,
  resetNativeToolSearchRejections,
  resolveToolSearchCapability,
} from "../src/model/tool-search.js";

const BASE_URL = "https://relay.example.com";

afterEach(() => resetNativeToolSearchRejections());

function rejection(message: string, status = 400) {
  return new APICallError({
    message,
    url: `${BASE_URL}/v1/messages`,
    requestBodyValues: {},
    statusCode: status,
    responseBody: JSON.stringify({ error: { type: "invalid_request_error", message } }),
    isRetryable: false,
  });
}

describe("ToolSearch provider capability", () => {
  it("auto 只对 Anthropic 协议且标记支持原生的渠道启用原生", () => {
    const api = { type: "anthropic-messages", baseUrl: BASE_URL };
    expect(resolveToolSearchCapability("p", api)).toMatchObject({
      protocolSupported: true,
      defaultEnabled: false,
    });
    expect(
      resolveToolSearchCapability("p", { ...api, supportsNativeToolSearch: true }),
    ).toMatchObject({ protocolSupported: true, defaultEnabled: true });
    expect(
      resolveToolSearchCapability("p", {
        type: "openai-chat-completions",
        baseUrl: BASE_URL,
        supportsNativeToolSearch: true,
      }),
    ).toMatchObject({ protocolSupported: false, defaultEnabled: false });
  });

  it("运行时被拒后同一渠道降级，地址变化后重新按配置尝试", () => {
    const api = { type: "anthropic-messages", baseUrl: BASE_URL, supportsNativeToolSearch: true };
    const capability = resolveToolSearchCapability("p", api);
    markNativeToolSearchRejected("p", BASE_URL);
    expect(capability.defaultEnabled).toBe(false);
    expect(resolveToolSearchCapability("other", api).defaultEnabled).toBe(true);
    expect(
      resolveToolSearchCapability("p", { ...api, baseUrl: "https://api.anthropic.com" })
        .defaultEnabled,
    ).toBe(true);
  });

  it("只把指向原生 ToolSearch 字段或 beta 的 4xx 识别为拒绝", () => {
    expect(isNativeToolSearchRejection(rejection("tools.1.defer_loading: Extra inputs"))).toBe(
      true,
    );
    expect(
      isNativeToolSearchRejection(rejection(`Unexpected value(s) \`${TOOL_SEARCH_BETA}\``)),
    ).toBe(true);
    expect(isNativeToolSearchRejection(rejection("max_tokens: too large"))).toBe(false);
    expect(isNativeToolSearchRejection(rejection("defer_loading unavailable", 500))).toBe(false);
  });
});

describe("AiSdkModelAdapter native ToolSearch fallback", () => {
  function createAdapter(runtime: AiSdkModelRuntime) {
    const providerConfig = new ProviderConfig({
      access: new ApiKeyAccessConfig({ apiKey: "test-key" }),
      api: new ProviderApiConfig({
        type: "anthropic-messages",
        baseUrl: BASE_URL,
        supportsNativeToolSearch: true,
      }),
      builtinModelIds: [],
      enabled: true,
      id: "relay",
      personalModelIds: ["claude-test"],
      name: "Relay",
      visibility: "visible",
    }) as RegistryProviderConfig;
    const modelConfig = new ModelConfig({
      enabled: true,
      properties: new ModelPropertiesConfig({
        requiresMfjsToolSchema: false,
        contextWindow: 200_000,
        inputFormat: new ModelInputFormatConfig({
          supportsText: true,
          supportsImage: false,
          supportsVideo: false,
          supportsAudio: false,
          supportsPdf: false,
        }),
        outputFormat: new ModelOutputFormatConfig({ supportsText: true }),
        supportsToolCall: true,
        supportsJsonSchemaOutput: false,
        supportsNativeWebSearch: false,
        supportsMidConversationSystem: false,
      }),
      optionSpecs: new ModelOptionSpecsConfig({
        reasoningLevel: { values: ["none"], map: "{}" },
        maxOutputTokens: { max: 32_000, map: '{"max_tokens": maxOutputTokens}' },
      }),
    }) as RegistryModelConfig;
    return new AiSdkModelAdapter({ runtime, retry: { maxAttempts: 1 } }).createModel({
      providerId: "relay",
      modelId: "claude-test",
      providerConfig,
      modelConfig,
      options: { maxOutputTokens: 1_000, reasoningLevel: "none" },
    });
  }

  function betaOf(options: { headers?: Record<string, string | undefined> }) {
    return Object.entries(options.headers ?? {}).find(
      ([name]) => name.toLowerCase() === "anthropic-beta",
    )?.[1];
  }

  it("generateText 被拒后以非原生形态重发，并让后续 auto 改走 local", async () => {
    const betas: Array<string | undefined> = [];
    const runtime: AiSdkModelRuntime = {
      async generateText(options) {
        const beta = betaOf(options as never);
        betas.push(beta);
        if (beta?.includes(TOOL_SEARCH_BETA)) throw rejection("tools.0.defer_loading: unknown");
        return { finishReason: "stop", text: "ok", totalUsage: {}, usage: {} } as never;
      },
      streamText() {
        throw new Error("not used");
      },
    };
    const model = createAdapter(runtime);
    expect(model.requestCapabilities?.toolSearch?.defaultEnabled).toBe(true);

    const result = await model.generateText({
      messages: [{ role: "user", content: "hi" }],
      toolSearchEnabled: true,
    });

    expect(result.text).toBe("ok");
    expect(betas).toEqual([expect.stringContaining(TOOL_SEARCH_BETA), undefined]);
    expect(model.requestCapabilities?.toolSearch?.defaultEnabled).toBe(false);
  });

  it("非原生请求或无关错误不重发", async () => {
    let calls = 0;
    const runtime: AiSdkModelRuntime = {
      async generateText() {
        calls += 1;
        throw rejection("tools.0.defer_loading: unknown");
      },
      streamText() {
        throw new Error("not used");
      },
    };
    const model = createAdapter(runtime);
    await expect(
      model.generateText({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toBeDefined();
    expect(calls).toBe(1);
    expect(model.requestCapabilities?.toolSearch?.defaultEnabled).toBe(true);
  });

  it("streamText 在响应开始前被拒时降级重发", async () => {
    const betas: Array<string | undefined> = [];
    const runtime: AiSdkModelRuntime = {
      async generateText() {
        throw new Error("not used");
      },
      streamText(options) {
        const beta = betaOf(options as never);
        betas.push(beta);
        if (beta?.includes(TOOL_SEARCH_BETA)) throw rejection("tool_reference is not supported");
        return {
          fullStream: (async function* () {
            yield { type: "text-delta", id: "t", text: "ok" };
            yield {
              type: "finish",
              finishReason: "stop",
              totalUsage: { inputTokens: 1, outputTokens: 1 },
            };
          })(),
        } as never;
      },
    };
    const model = createAdapter(runtime);
    const events = [];
    for await (const event of model.streamText({
      messages: [{ role: "user", content: "hi" }],
      toolSearchEnabled: true,
    })) {
      events.push(event);
    }
    expect(betas).toEqual([expect.stringContaining(TOOL_SEARCH_BETA), undefined]);
    expect(events).toContainEqual(expect.objectContaining({ type: "text_delta", text: "ok" }));
    expect(model.requestCapabilities?.toolSearch?.defaultEnabled).toBe(false);
  });
});

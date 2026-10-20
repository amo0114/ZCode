import { describe, expect, it } from "vitest";
import {
  buildCustomProviderApiConfig,
  buildLoginApiKeyDefaultModelPreferenceFromSelection,
  isValidCustomProviderBaseUrl,
  resolveCustomProviderName,
  resolveHydratedLoginApiKeyValue,
  shouldShowLoginApiKeyLink,
  summarizeRecommendedModelConfig,
} from "@/login/LoginApiKeyForm.helpers.js";
import { encodeCustomModelValue } from "@/lib/zcodeCustomModelValue.js";

describe("LoginApiKeyForm provider update helpers", () => {
  it("自定义渠道只在 Anthropic 格式且已确认时写入原生 ToolSearch 标记", () => {
    expect(
      buildCustomProviderApiConfig({
        apiType: "anthropic-messages",
        baseUrl: " https://relay.test ",
        nativeToolSearch: true,
      }),
    ).toEqual({
      type: "anthropic-messages",
      baseUrl: "https://relay.test",
      supportsNativeToolSearch: true,
    });
    expect(
      buildCustomProviderApiConfig({
        apiType: "anthropic-messages",
        baseUrl: "https://relay.test",
        nativeToolSearch: false,
      }),
    ).toEqual({ type: "anthropic-messages", baseUrl: "https://relay.test" });
    // 切换到 OpenAI 格式后残留的确认不能写入。
    expect(
      buildCustomProviderApiConfig({
        apiType: "openai-chat-completions",
        baseUrl: "https://relay.test",
        nativeToolSearch: true,
      }),
    ).toEqual({ type: "openai-chat-completions", baseUrl: "https://relay.test" });
  });

  it("只有输入框为空且 provider 有 URL 时展示获取 API key 链接", () => {
    expect(shouldShowLoginApiKeyLink("", "https://z.ai/manage-apikey/apikey-list")).toBe(true);
    expect(shouldShowLoginApiKeyLink(" sk-login ", "https://z.ai/manage-apikey/apikey-list")).toBe(
      false,
    );
    expect(shouldShowLoginApiKeyLink("", undefined)).toBe(false);
  });

  it("新 Provider Runtime 从 Selection View 选择 API key 登录后的默认模型", () => {
    expect(
      buildLoginApiKeyDefaultModelPreferenceFromSelection(
        {
          revision: 3,
          providers: [
            {
              providerId: "bigmodel-api",
              config: {
                kind: "api",
                models: ["glm-5.3", "glm-5.2"],
              },
              models: [
                { modelId: "glm-5.3", config: {} },
                { modelId: "glm-5.2", config: {} },
              ],
            },
          ],
        },
        "bigmodel-api",
      ),
    ).toBe(encodeCustomModelValue("bigmodel-api", "glm-5.3"));
  });

  it("已保存 API key 只在用户尚未编辑输入框时回填", () => {
    expect(
      resolveHydratedLoginApiKeyValue({
        savedApiKey: " sk-saved ",
        userEdited: false,
      }),
    ).toBe("sk-saved");
    expect(
      resolveHydratedLoginApiKeyValue({
        savedApiKey: "sk-saved",
        userEdited: true,
      }),
    ).toBeNull();
  });

  it("自定义供应商只接受 http(s) Base URL，并以 hostname 作为 Provider 名称", () => {
    expect(isValidCustomProviderBaseUrl(" https://api.example.com/v1 ")).toBe(true);
    expect(isValidCustomProviderBaseUrl("http://localhost:8080")).toBe(true);
    expect(isValidCustomProviderBaseUrl("api.example.com/v1")).toBe(false);
    expect(isValidCustomProviderBaseUrl("ftp://api.example.com")).toBe(false);
    expect(resolveCustomProviderName("https://api.deepseek.com/v1")).toBe("deepseek");
    expect(resolveCustomProviderName("https://openrouter.ai/api/v1")).toBe("openrouter");
    expect(resolveCustomProviderName("https://my-relay.example.cn/v1")).toBe("my-relay");
    expect(resolveCustomProviderName("http://localhost:8080/v1")).toBe("localhost");
    expect(resolveCustomProviderName("http://127.0.0.1:8080/v1")).toBe("127.0.0.1");
    expect(resolveCustomProviderName("not a url")).toBeUndefined();
  });

  it("推荐配置摘要以 K/M 展示 token 数，并只统计非 disabled 的思考档位", () => {
    expect(
      summarizeRecommendedModelConfig({
        properties: {
          contextWindow: 1_048_576,
          supportsToolCall: true,
          inputFormat: { supportsImage: true },
        },
        optionSpecs: {
          reasoningLevel: { values: ["disabled", "low", "high", "max"] },
          maxOutputTokens: { max: 384_000 },
        },
      } as Parameters<typeof summarizeRecommendedModelConfig>[0]),
    ).toEqual({
      contextWindow: "1M",
      maxOutputTokens: "384K",
      reasoningLevels: 3,
      supportsToolCall: true,
      supportsImage: true,
    });
    expect(
      summarizeRecommendedModelConfig({ properties: { supportsToolCall: false } } as Parameters<
        typeof summarizeRecommendedModelConfig
      >[0]),
    ).toEqual({ reasoningLevels: 0, supportsToolCall: false, supportsImage: false });
  });
});

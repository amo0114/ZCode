import { describe, expect, it, vi } from "vitest";
import {
  ApiKeyAccessConfig,
  ProviderApiConfig,
  ProviderConfig,
  parsePersonalModelConfigRules,
  parsePersonalProviderConfigMap,
  parseProviderConfig,
  parseZCodeBuiltinModelConfigRules,
  parseZCodeBuiltinProviderConfigRules,
} from "../src/index.js";

describe("ProviderConfig access / api boundaries", () => {
  it("把访问资格与 API 协议解析成两个独立的 Config Overlay", () => {
    const config = parseProviderConfig({
      access: { type: "api-key", apiKey: "secret" },
      api: {
        type: "anthropic-messages",
        baseUrl: "https://api.example.com",
      },
      builtinModelIds: ["model-a"],
    });

    expect(config.access).toBeInstanceOf(ApiKeyAccessConfig);
    expect(config.api).toBeInstanceOf(ProviderApiConfig);
    expect(config.toJSON()).toEqual({
      access: { type: "api-key", apiKey: "secret" },
      api: {
        type: "anthropic-messages",
        baseUrl: "https://api.example.com",
      },
      builtinModelIds: ["model-a"],
    });
  });

  it("递归 Overlay Provider、Access 与 API 字段", () => {
    const zcodeBuiltin = new ProviderConfig({
      group: "standard-personal",
      logo: { type: "builtin", key: "deepseek" },
      access: new ApiKeyAccessConfig({
        apiKeyManagementUrl: "https://platform.deepseek.com/api_keys",
      }),
      api: new ProviderApiConfig({
        type: "anthropic-messages",
        baseUrl: "https://api.deepseek.com/anthropic",
      }),
      builtinModelIds: ["deepseek-v4"],
    });
    const personal = new ProviderConfig({
      access: new ApiKeyAccessConfig({ apiKey: "sk-personal" }),
      api: new ProviderApiConfig({ headers: { "X-Team": "agent" } }),
    });

    const effective = zcodeBuiltin.overlay(personal);

    // 名称由规则外层 overlay 测试覆盖；此处只验证执行配置。
    expect(effective.logo).toEqual({ type: "builtin", key: "deepseek" });

    expect(zcodeBuiltin.overlay(new ProviderConfig({ logo: null })).logo).toBeNull();
    expect(effective.access).toMatchObject({
      type: "api-key",
      apiKey: "sk-personal",
      apiKeyManagementUrl: "https://platform.deepseek.com/api_keys",
    });
    expect(effective.api).toMatchObject({
      type: "anthropic-messages",
      baseUrl: "https://api.deepseek.com/anthropic",
      headers: { "X-Team": "agent" },
    });
    expect(effective.validateComplete()).toEqual([]);
  });

  it("接受开放的 Built-in Logo key，拒绝未知 Logo 类型", () => {
    expect(
      parseProviderConfig({ logo: { type: "builtin", key: "future-provider-logo" } }).toJSON(),
    ).toEqual({ logo: { type: "builtin", key: "future-provider-logo" } });
    expect(() =>
      parseProviderConfig({ logo: { type: "url", url: "https://example.com/logo.svg" } }),
    ).toThrow();
  });

  it("Provider Config 不接受关闭 Usage 的执行开关", () => {
    expect(() =>
      parseProviderConfig({
        access: { type: "api-key", apiKey: "test-key" },
        includeUsage: false,
      }),
    ).toThrow();
  });

  it("hidden 不放宽 Provider 完整性，旧 executionOnly 中间格式不再接受", () => {
    const hidden = new ProviderConfig({
      group: "standard-personal",
      visibility: "hidden",
      access: new ApiKeyAccessConfig({ apiKey: "key" }),
      api: new ProviderApiConfig({ type: "anthropic-messages" }),
      builtinModelIds: ["GLM-5.2"],
    });

    expect(hidden.validateComplete(["providers", "hidden"])).toContainEqual({
      code: "required-field-missing",
      path: ["providers", "hidden", "api", "baseUrl"],
      message: "缺少必填配置 providers.hidden.api.baseUrl",
    });
    expect(() =>
      parseProviderConfig({
        executionOnly: true,
        api: { type: "anthropic-messages" },
        models: ["GLM-5.2"],
      }),
    ).toThrow();
  });

  it("visibility 遵循 Provider Overlay 顺序并默认可见", () => {
    const builtIn = new ProviderConfig({ visibility: "hidden" });

    expect(new ProviderConfig().visibility).toBeUndefined();
    expect(builtIn.overlay(new ProviderConfig()).visibility).toBe("hidden");
    expect(builtIn.overlay(new ProviderConfig({ visibility: "visible" })).visibility).toBe(
      "visible",
    );
  });

  it("API Key Access 必须在最终 Overlay 后取得 API Key", () => {
    const incomplete = new ProviderConfig({
      group: "standard-personal",
      access: new ApiKeyAccessConfig(),
      api: new ProviderApiConfig({
        type: "openai-chat-completions",
        baseUrl: "https://api.example.com/v1",
      }),
      builtinModelIds: ["model-a"],
    });

    expect(incomplete.validateComplete(["providers", "api"])).toContainEqual({
      code: "required-field-missing",
      path: ["providers", "api", "access", "apiKey"],
      message: "缺少必填配置 providers.api.access.apiKey",
    });
  });

  it("Personal Provider 允许暂存非法 endpoint，并在完整性校验时 fail-closed", () => {
    const providers = parsePersonalProviderConfigMap({
      providerRules: [
        {
          providerId: "broken",
          config: {
            group: "standard-personal",
            access: { type: "api-key", apiKey: "test-key" },
            api: { type: "openai-chat-completions", baseUrl: "testtest" },
            personalModelIds: ["model-a"],
          },
        },
      ],
    });

    expect(providers.get("broken")?.api?.baseUrl).toBe("testtest");
    expect(providers.get("broken")?.validateComplete(["providers", "broken"])).toContainEqual({
      code: "invalid-url",
      path: ["providers", "broken", "api", "baseUrl"],
      message: "配置 providers.broken.api.baseUrl 必须是有效 URL",
    });
  });

  it("正式 Access Schema 拒绝 execution-provided 与伪通用协议字段", () => {
    expect(() => parseProviderConfig({ access: { type: "execution-provided" } })).toThrow();
    expect(() => parseProviderConfig({ access: { type: "zhipu-account" } })).toThrow();
    expect(() =>
      parseProviderConfig({
        access: { type: "api-key", apiKey: "secret", requestSigning: "zcode-v4" },
      }),
    ).toThrow();
  });
  // P2 清洗范围验证：只剔除本阶段退役的 4 个精确 ID，其余 `account:*` 覆盖规则必须保留。

  // P2 清洗边界验证：清洗只认精确 ID，不能按 `account:` 前缀扩大范围。
  // `account:zai-individual-coding-plan` 属于 P4 的处理范围，本阶段必须原样保留。

  // D4a：智谱账号接入退役后，旧个人配置中的 account:* 条目在解码边界剔除，其余照常加载。
  it("个人配置含 account:* 覆盖规则时剔除这些条目，其余 provider 仍正常加载", () => {
    const providers = parsePersonalProviderConfigMap({
      providerRules: [
        {
          providerId: "my-provider",
          config: {
            group: "standard-personal",
            access: { type: "api-key", apiKey: "secret" },
            api: { type: "openai-chat-completions", baseUrl: "https://api.example.com" },
            personalModelIds: ["model-a"],
          },
        },
        { providerId: "account:zai-individual-coding-plan", config: { modelOrder: ["GLM-5.3"] } },
        { providerId: "account:bigmodel-team-coding-plan", enabled: false, config: {} },
      ],
    });

    expect(providers.keys()).toEqual(["my-provider"]);
    expect(providers.get("my-provider")?.personalModelIds).toEqual(["model-a"]);
  });

  // D5：旧套餐 Key 类型按普通 API Key 读取，保留 Key 与管理入口。
  it("zhipu-coding-plan-api-key 按 api-key 读取并保留 Key", () => {
    const providers = parsePersonalProviderConfigMap({
      providerRules: [
        {
          providerId: "my-zai",
          templateId: "zai-api",
          config: {
            access: {
              type: "zhipu-coding-plan-api-key",
              apiKey: "secret",
              apiKeyManagementUrl: "https://z.ai/manage-apikey/apikey-list",
            },
          },
        },
      ],
    });

    expect(providers.get("my-zai")?.access?.toJSON()).toEqual({
      type: "api-key",
      apiKey: "secret",
      apiKeyManagementUrl: "https://z.ai/manage-apikey/apikey-list",
    });
  });

  it("个人模型规则中引用 account:* 的条目被剔除", () => {
    const rules = parsePersonalModelConfigRules({
      providerModelRules: [
        { providerId: "account:zai-start-plan", modelId: "GLM-5.3", config: { enabled: false } },
        { providerId: "my-provider", modelId: "model-a", config: { enabled: false } },
      ],
      manualProviderModelRules: [],
    });

    expect(rules.getExact("account:zai-start-plan", "GLM-5.3")).toBeUndefined();
    expect(rules.getExact("my-provider", "model-a")?.toJSON()).toEqual({ enabled: false });
  });

  // D2/D10：远端 Release 仍可能下发 zhipu-account 规则与 family group，必须逐条忽略而非整份拒绝。
  it("内置规则中的 zhipu-account Provider、family group 与关联模型规则被逐条忽略", () => {
    const { providers, providerTemplates } = parseZCodeBuiltinProviderConfigRules({
      templateRules: [
        {
          templateId: "zai-api",
          templateNameMap: { "zh-CN": "Z.ai Coding Plan" },
          config: {
            access: { type: "zhipu-coding-plan-api-key" },
            api: { type: "anthropic-messages", baseUrl: "https://api.z.ai/api/anthropic" },
          },
        },
      ],
      providerRules: [
        {
          providerId: "account:zai-individual-coding-plan",
          config: {
            group: "zai-family",
            access: { type: "zhipu-account", accountType: "zai", mode: "individual-coding-plan" },
            api: { type: "anthropic-messages", baseUrl: "https://api.z.ai/api/anthropic" },
          },
        },
        {
          providerId: "builtin-api",
          config: {
            group: "standard-personal",
            access: { type: "api-key" },
            api: { type: "anthropic-messages", baseUrl: "https://example.com" },
          },
        },
      ],
    });
    const models = parseZCodeBuiltinModelConfigRules({
      modelRules: [],
      modelApiRules: [],
      providerSiteRules: [],
      templateModelRules: [],
      builtinProviderModelRules: [
        {
          providerId: "account:zai-individual-coding-plan",
          modelId: "GLM-5.3",
          config: { enabled: true },
        },
      ],
    });

    expect(providers.keys()).toEqual(["builtin-api"]);
    expect(providerTemplates.get("zai-api")?.config.access?.type).toBe("api-key");
    expect(models.toZCodeBuiltinJSON().builtinProviderModelRules).toEqual([]);
  });

  it("个人配置轮询重复解析时，同一退役条目只 warn 一次", async () => {
    vi.resetModules();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { parsePersonalProviderConfigMap: parseFresh } = await import("../src/index.js");
      const input = {
        providerRules: [{ providerId: "account:zai-start-plan", config: {} }],
      };
      parseFresh(input);
      parseFresh(input);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});

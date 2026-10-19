import { describe, expect, it } from "vitest";
import {
  parsePersonalModelConfigRules,
  parsePersonalProviderConfigMap,
  parseZCodeBuiltinProviderConfigMap,
} from "../src/index.js";

describe("Todo 21 source contracts", () => {
  it("ZCode Built-in Provider 不能声明 Personal 成员字段", () => {
    const providers = parseZCodeBuiltinProviderConfigMap([
      {
        providerId: "builtin",
        config: {
          group: "standard-personal",
          visibility: "visible",
          access: { type: "api-key" },
          api: { type: "anthropic-messages", baseUrl: "https://example.com" },
          builtinModelIds: ["model-a"],
        },
      },
    ]);

    expect(providers.get("builtin")?.builtinModelIds).toEqual(["model-a"]);
    expect(() =>
      parseZCodeBuiltinProviderConfigMap([
        {
          providerId: "invalid",
          config: { group: "standard-personal", personalModelIds: ["model-a"] },
        },
      ]),
    ).toThrow();
    expect(() =>
      parseZCodeBuiltinProviderConfigMap([
        { providerId: "invalid", config: { group: "zai-family" } },
      ]),
    ).toThrow();
  });

  it("Personal Provider 不能写 builtinModelIds，根 group 只能是 standard-personal", () => {
    const providers = parsePersonalProviderConfigMap({
      providerRules: [
        {
          providerId: "personal",
          config: {
            group: "standard-personal",
            personalModelIds: ["model-a"],
            modelOrder: ["model-a"],
          },
        },
        { providerId: "overlay", providerName: "Overlay", config: {} },
      ],
    });
    expect(providers.get("personal")?.modelOrder).toEqual(["model-a"]);
    expect(() =>
      parsePersonalProviderConfigMap({
        providerRules: [{ providerId: "personal", config: { builtinModelIds: ["model-a"] } }],
      }),
    ).toThrow();
    expect(() =>
      parsePersonalProviderConfigMap({
        providerRules: [{ providerId: "personal", config: { group: "standard-builtin" } }],
      }),
    ).toThrow();
  });

  it("Personal Provider 缺失 access 时保持不完整，不从 group 推断 Access", () => {
    const providers = parsePersonalProviderConfigMap({
      providerRules: [
        { providerId: "personal", config: { group: "standard-personal" } },
        { providerId: "overlay", providerName: "Overlay", config: {} },
      ],
    });

    expect(providers.get("personal")?.access).toBeUndefined();
    expect(providers.get("overlay")?.access).toBeUndefined();
  });

  it("Model 没有 visibility", () => {
    expect(() =>
      parsePersonalModelConfigRules([
        {
          type: "provider-model",
          providerId: "provider-a",
          modelId: "model-a",
          config: { visibility: "hidden" },
        },
      ]),
    ).toThrow();
  });
});

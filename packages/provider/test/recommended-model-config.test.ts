import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  ProviderSettingsFacade,
  parseZCodeBuiltinModelConfigRules,
  type ProviderRegistryServiceSnapshot,
} from "../src/index.js";

async function createFacade(): Promise<ProviderSettingsFacade> {
  const release = JSON.parse(
    await readFile(new URL("../../../config/provider/zcode-builtin.json", import.meta.url), "utf8"),
  );
  const snapshot = {
    config: {
      zcodeBuiltinModelRules: parseZCodeBuiltinModelConfigRules(release.config.modelConfigRules),
    },
  } as unknown as ProviderRegistryServiceSnapshot;
  return new ProviderSettingsFacade({
    getSnapshot: () => snapshot,
  } as unknown as ConstructorParameters<typeof ProviderSettingsFacade>[0]);
}

describe("新建自定义 Provider 前预览推荐模型配置", () => {
  it("第三方站点上的 DeepSeek V4.1 Flash 按模型与 API 格式命中专门规则", async () => {
    const facade = await createFacade();
    const result = facade.resolveRecommendedModelConfig({
      apiType: "openai-chat-completions",
      baseUrl: "https://relay.example.com/v1",
      modelId: "deepseek-ai/DeepSeek-V4.1-Flash",
    });
    expect(result.recognized).toBe(true);
    expect(result.config).toMatchObject({
      properties: { contextWindow: 1_000_000, inputFormat: { supportsImage: true } },
      optionSpecs: {
        reasoningLevel: { values: ["disabled", "low", "high", "max"] },
        maxOutputTokens: { max: 384_000 },
      },
    });
    expect(result.config.optionSpecs?.reasoningLevel?.map).toContain("reasoning_effort");
  });

  it("未知模型只命中通用兜底规则时标记为未识别", async () => {
    const facade = await createFacade();
    const result = facade.resolveRecommendedModelConfig({
      apiType: "openai-chat-completions",
      baseUrl: "https://relay.example.com/v1",
      modelId: "acme-llm-7",
    });
    expect(result.recognized).toBe(false);
    expect(result.config.properties?.contextWindow).toBe(200_000);
  });
});

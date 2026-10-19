import { z } from "zod";
import { modelConfigDataSchema } from "@zcode/shared/model-config";
import { providerConfigDataSchema } from "./provider-data-schema.js";
import { ModelConfig, ModelConfigRules } from "./model-config.js";
import {
  ApiKeyAccessConfig,
  ProviderApiConfig,
  ProviderConfig,
  ProviderConfigMap,
  ProviderTemplate,
  ProviderTemplateMap,
} from "./provider-config.js";
import {
  builtinModelConfigRulesSchema,
  personalModelConfigRulesSchema,
  builtinProviderConfigRulesSchema,
  personalProviderConfigRulesSchema,
  providerConfigRuleSchema,
  providerTemplateConfigRuleSchema,
  builtinProviderConfigRuleSchema,
  type ProviderConfigRuleData,
  type ProviderTemplateConfigRuleData,
} from "./rule-data-schema.js";

export function parseProviderConfigMap(input: unknown): ProviderConfigMap {
  return createProviderRules(z.array(providerConfigRuleSchema).parse(input));
}

export function parseZCodeBuiltinProviderConfigMap(input: unknown): ProviderConfigMap {
  return createProviderRules(z.array(builtinProviderConfigRuleSchema).parse(input));
}

export function parseProviderTemplateMap(input: unknown): ProviderTemplateMap {
  return createTemplateRules(z.array(providerTemplateConfigRuleSchema).parse(input));
}

export function parseZCodeBuiltinProviderConfigRules(input: unknown): {
  providers: ProviderConfigMap;
  providerTemplates: ProviderTemplateMap;
} {
  const parsed = builtinProviderConfigRulesSchema.parse(scrubRetiredProviderConfigRules(input));
  return {
    providers: createProviderRules(parsed.providerRules),
    providerTemplates: createTemplateRules(parsed.templateRules),
  };
}

/**
 * 智谱账号接入退役后的解码边界清洗：个人配置、内置 Bundled 与远端 Release / LKG 都经此入口。
 *
 * 只处理明确退役的数据：`account:*` Provider（个人 Overlay 中这类条目没有 `access`，只能按
 * providerId 识别）与 `zhipu-account` Access 规则、引用它们的模型规则，以及按 `api-key`
 * 读取的 `zhipu-coding-plan-api-key`。其余数据仍走 strict 校验，不做“未知即丢弃”。
 * 必须在 zod 之前执行：旧条目带的 `zai-family` / `bigmodel-family` group 已不在 enum 中。
 * 磁盘文件不改写；用户之后保存时自然写回清洗结果。
 */
const RETIRED_PROVIDER_ID_PREFIX = "account:";
const RETIRED_API_KEY_ACCESS_TYPE = "zhipu-coding-plan-api-key";

const reportedRetiredProviderIds = new Set<string>();

function isRetiredProviderId(providerId: unknown): boolean {
  return typeof providerId === "string" && providerId.startsWith(RETIRED_PROVIDER_ID_PREFIX);
}

function isRetiredProviderRule(rule: unknown): boolean {
  if (!isRecord(rule)) return false;
  if (isRetiredProviderId(rule.providerId)) return true;
  return isRecord(rule.config) && isRecord(rule.config.access)
    ? rule.config.access.type === "zhipu-account"
    : false;
}

function mapRetiredApiKeyAccess(rule: unknown): unknown {
  if (!isRecord(rule) || !isRecord(rule.config) || !isRecord(rule.config.access)) return rule;
  if (rule.config.access.type !== RETIRED_API_KEY_ACCESS_TYPE) return rule;
  return {
    ...rule,
    config: { ...rule.config, access: { ...rule.config.access, type: "api-key" } },
  };
}

function scrubRetiredProviderConfigRules(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const retired: string[] = [];
  const output: Record<string, unknown> = { ...input };
  if (Array.isArray(input.providerRules)) {
    output.providerRules = input.providerRules
      .filter((rule) => {
        if (!isRetiredProviderRule(rule)) return true;
        retired.push(String((rule as Record<string, unknown>).providerId));
        return false;
      })
      .map(mapRetiredApiKeyAccess);
  }
  if (Array.isArray(input.templateRules)) {
    output.templateRules = input.templateRules.map(mapRetiredApiKeyAccess);
  }
  reportRetiredProviderIds(retired);
  return output;
}

function scrubRetiredModelConfigRules(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const output: Record<string, unknown> = { ...input };
  for (const key of [
    "builtinProviderModelRules",
    "providerModelRules",
    "manualProviderModelRules",
  ] as const) {
    const rules = input[key];
    if (!Array.isArray(rules)) continue;
    output[key] = rules.filter((rule) => !isRecord(rule) || !isRetiredProviderId(rule.providerId));
  }
  return output;
}

function reportRetiredProviderIds(retired: readonly string[]): void {
  // 个人配置每秒轮询重解析，而磁盘条目要等用户保存才消失；按进程去重，避免日志刷屏。
  // 只记录条目数量与 providerId，不记录凭据。
  const unreported = retired.filter((providerId) => !reportedRetiredProviderIds.has(providerId));
  if (unreported.length === 0) return;
  for (const providerId of unreported) reportedRetiredProviderIds.add(providerId);
  console.warn(
    `[provider] 已忽略 ${unreported.length} 条退役的智谱账号 Provider 规则: ${unreported.join(", ")}`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePersonalProviderConfigMap(input: unknown): ProviderConfigMap {
  const scrubbed = scrubRetiredProviderConfigRules(input);
  return createProviderRules(personalProviderConfigRulesSchema.parse(scrubbed).providerRules);
}

export function parseProviderConfig(input: unknown): ProviderConfig {
  return createProviderConfig(providerConfigDataSchema.parse(input));
}

export function parseModelConfig(input: unknown): ModelConfig {
  return createModelConfig(modelConfigDataSchema.parse(input));
}

export function parseZCodeBuiltinModelConfigRules(input: unknown): ModelConfigRules {
  const parsed = builtinModelConfigRulesSchema.parse(scrubRetiredModelConfigRules(input));
  return new ModelConfigRules([
    ...parsed.modelRules.map((rule) => ({
      ...rule,
      type: "model" as const,
      config: createModelConfig(rule.config),
    })),
    ...parsed.modelApiRules.map((rule) => ({
      ...rule,
      type: "model-api" as const,
      config: createModelConfig(rule.config),
    })),
    ...parsed.providerSiteRules.map((rule) => ({
      ...rule,
      type: "provider-site" as const,
      config: createModelConfig(rule.config),
    })),
    ...parsed.templateModelRules.map((rule) => ({
      ...rule,
      type: "template-model" as const,
      config: createModelConfig(rule.config),
    })),
    ...parsed.builtinProviderModelRules.map((rule) => ({
      ...rule,
      type: "provider-model" as const,
      config: createModelConfig(rule.config),
    })),
  ]);
}

export function parsePersonalModelConfigRules(input: unknown): ModelConfigRules {
  const parsed = personalModelConfigRulesSchema.parse(scrubRetiredModelConfigRules(input));
  return new ModelConfigRules([
    ...parsed.providerModelRules.map((rule) => ({
      ...rule,
      type: "provider-model" as const,
      config: createModelConfig(rule.config),
    })),
    ...parsed.manualProviderModelRules.map((rule) => ({
      ...rule,
      type: "manual-provider-model" as const,
      config: createModelConfig(rule.config),
    })),
  ]);
}

function createProviderRules(rules: readonly ProviderConfigRuleData[]): ProviderConfigMap {
  return new ProviderConfigMap(
    rules.map(({ config, ...rule }) => ({
      ...rule,
      config: createProviderConfig(config),
    })),
  );
}

function createTemplateRules(
  rules: readonly ProviderTemplateConfigRuleData[],
): ProviderTemplateMap {
  return new ProviderTemplateMap(
    rules.map((rule) => [
      rule.templateId,
      new ProviderTemplate({ ...rule, config: createProviderConfig(rule.config) }),
    ]),
  );
}

function createProviderConfig(config: z.infer<typeof providerConfigDataSchema>): ProviderConfig {
  return new ProviderConfig({
    ...config,
    access: config.access == null ? config.access : new ApiKeyAccessConfig(config.access),
    api: config.api == null ? config.api : new ProviderApiConfig(config.api),
  });
}

function createModelConfig(config: z.infer<typeof modelConfigDataSchema>): ModelConfig {
  return ModelConfig.fromData(config);
}

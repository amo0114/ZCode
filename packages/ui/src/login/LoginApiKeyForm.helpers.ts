import type { ModelConfigObject, ProviderApiType } from "@zcode/provider";
import type { ModelSelectionView } from "@zcode/services";
import { encodeCustomModelValue } from "@/lib/zcodeCustomModelValue.js";

/** 下拉框中「自定义供应商」的取值；Template id 不含双下划线前缀，不会冲突。 */
export const LOGIN_CUSTOM_PROVIDER_VALUE = "__custom__";

export function isValidCustomProviderBaseUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const GENERIC_HOST_LABELS = new Set(["api", "www"]);

/** 用户未填名称时取域名主体作默认名（api.deepseek.com → deepseek），避免模型选择器里出现整段域名。 */
/** 自定义渠道的 api 配置；原生 ToolSearch 只对 Anthropic 格式且经用户确认或检测通过时写入。 */
export function buildCustomProviderApiConfig(input: {
  apiType: ProviderApiType;
  baseUrl: string;
  nativeToolSearch: boolean;
}): { type: ProviderApiType; baseUrl: string; supportsNativeToolSearch?: true } {
  return {
    type: input.apiType,
    baseUrl: input.baseUrl.trim(),
    ...(input.apiType === "anthropic-messages" && input.nativeToolSearch
      ? { supportsNativeToolSearch: true as const }
      : {}),
  };
}

export function resolveCustomProviderName(baseUrl: string): string | undefined {
  if (!isValidCustomProviderBaseUrl(baseUrl)) return undefined;
  const hostname = new URL(baseUrl.trim()).hostname;
  // IP 与单段主机名（localhost）没有可提取的主体，原样使用。
  if (/^[\d.]+$/.test(hostname) || hostname.startsWith("[") || !hostname.includes(".")) {
    return hostname;
  }
  const labels = hostname.split(".");
  while (labels.length > 2 && GENERIC_HOST_LABELS.has(labels[0]!)) labels.shift();
  return labels[0];
}

export interface RecommendedModelConfigSummary {
  readonly contextWindow?: string;
  readonly maxOutputTokens?: string;
  readonly reasoningLevels: number;
  readonly supportsToolCall: boolean;
  readonly supportsImage: boolean;
}

function formatTokenCount(value: number): string {
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

export function summarizeRecommendedModelConfig(
  config: ModelConfigObject,
): RecommendedModelConfigSummary {
  const contextWindow = config.properties?.contextWindow;
  const maxOutputTokens = config.optionSpecs?.maxOutputTokens?.max;
  return {
    ...(typeof contextWindow === "number" ? { contextWindow: formatTokenCount(contextWindow) } : {}),
    ...(typeof maxOutputTokens === "number"
      ? { maxOutputTokens: formatTokenCount(maxOutputTokens) }
      : {}),
    reasoningLevels: (config.optionSpecs?.reasoningLevel?.values ?? []).filter(
      (level) => level !== "disabled",
    ).length,
    supportsToolCall: config.properties?.supportsToolCall !== false,
    supportsImage: config.properties?.inputFormat?.supportsImage === true,
  };
}

export function shouldShowLoginApiKeyLink(
  apiKeyValue: string,
  apiKeyUrl: string | undefined,
): boolean {
  return Boolean(apiKeyUrl) && apiKeyValue.trim().length === 0;
}

export function buildLoginApiKeyDefaultModelPreferenceFromSelection(
  view: ModelSelectionView,
  providerId: string,
): string | null {
  const firstModel = view.providers.find((provider) => provider.providerId === providerId)
    ?.models[0]?.modelId;
  return firstModel ? encodeCustomModelValue(providerId, firstModel) : null;
}

export function resolveHydratedLoginApiKeyValue({
  savedApiKey,
  userEdited,
}: {
  savedApiKey: string;
  userEdited: boolean;
}): string | null {
  if (userEdited) {
    return null;
  }
  return savedApiKey.trim();
}

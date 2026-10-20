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

/** 自定义供应商以站点域名命名，便于在模型选择器里区分多个自定义站点。 */
export function resolveCustomProviderName(baseUrl: string): string | undefined {
  return isValidCustomProviderBaseUrl(baseUrl) ? new URL(baseUrl.trim()).hostname : undefined;
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

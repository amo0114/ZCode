import type { ProviderApiType } from "@zcode/provider";
import type { ApiClient } from "@zcode/shared";

export interface ListRemoteModelsInput {
  readonly apiType: ProviderApiType;
  readonly baseUrl: string;
  readonly apiKey: string;
}

const LIST_REMOTE_MODELS_TIMEOUT_MS = 15_000;

/** 只读取 OpenAI / Anthropic 兼容的 `GET /models` 列表，供用户挑选模型 ID；不做能力推断。 */
export async function listRemoteModels(
  apiClient: ApiClient,
  input: ListRemoteModelsInput,
): Promise<readonly string[]> {
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, "");
  const isAnthropic = input.apiType === "anthropic-messages";
  // 与执行链一致：Anthropic Base URL 未带 /v1 时自动补齐。
  const url = `${isAnthropic && !baseUrl.endsWith("/v1") ? `${baseUrl}/v1` : baseUrl}/models`;
  const headers: Record<string, string> = isAnthropic
    ? { "x-api-key": input.apiKey, "anthropic-version": "2023-06-01" }
    : { Authorization: `Bearer ${input.apiKey}` };
  const response = await apiClient.request(url, {
    method: "GET",
    headers,
    timeoutMs: LIST_REMOTE_MODELS_TIMEOUT_MS,
  });
  if (!response.ok) {
    throw new Error(`GET ${url} failed with HTTP ${response.status}`);
  }
  const body = (await response.json()) as { data?: unknown };
  if (!Array.isArray(body.data)) {
    throw new Error(`GET ${url} returned no model list`);
  }
  const ids = body.data
    .map((item) => (item as { id?: unknown } | null)?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  return [...new Set(ids)];
}

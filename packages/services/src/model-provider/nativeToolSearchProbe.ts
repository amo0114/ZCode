import type { ApiClient } from "@zcode/shared";

export interface ProbeNativeToolSearchInput {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly modelId: string;
}

export interface NativeToolSearchProbeResult {
  readonly supported: boolean;
  /** 不支持时端点返回的错误摘要，供用户判断是中转剥离了 beta 还是后端模型不支持。 */
  readonly detail?: string;
}

// 与 CLI contracts 的 TOOL_SEARCH_BETA 保持一致；services 不依赖 CLI 包。
const TOOL_SEARCH_BETA = "advanced-tool-use-2025-11-20";
const PROBE_TIMEOUT_MS = 30_000;
const MAX_DETAIL_LENGTH = 300;

/**
 * 用与 ZCode 原生模式相同的请求形态探测端点：常驻 ToolSearch + 一个 defer_loading 工具，
 * 并带 beta 头。端点接受即视为支持；4xx 参数错误视为不支持；鉴权、模型不存在等其他失败直接抛出，
 * 不能误判为「不支持」。
 */
export async function probeNativeToolSearch(
  apiClient: ApiClient,
  input: ProbeNativeToolSearchInput,
): Promise<NativeToolSearchProbeResult> {
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, "");
  // 与执行链一致：Anthropic Base URL 未带 /v1 时自动补齐。
  const url = `${baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`}/messages`;
  const response = await apiClient.request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": TOOL_SEARCH_BETA,
    },
    body: JSON.stringify({
      model: input.modelId,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
      tools: [
        {
          name: "ToolSearch",
          description: "Search deferred tools by keyword.",
          input_schema: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
          },
        },
        {
          name: "zcode_tool_search_probe",
          description: "Probe tool; never called.",
          input_schema: { type: "object", properties: {} },
          defer_loading: true,
        },
      ],
    }),
    timeoutMs: PROBE_TIMEOUT_MS,
  });
  if (response.ok) return { supported: true };
  const detail = (await response.text().catch(() => "")).slice(0, MAX_DETAIL_LENGTH);
  if (response.status === 400 || response.status === 422) {
    return { supported: false, ...(detail ? { detail } : {}) };
  }
  throw new Error(`POST ${url} failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
}

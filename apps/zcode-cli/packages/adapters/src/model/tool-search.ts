import { TOOL_SEARCH_BETA, type ToolSearchCapability } from "@zcode/contracts";
import { APICallError } from "ai";
import { getStatusCode, unwrapRetryError } from "./failure-inspection.js";

interface ToolSearchProviderApi {
  readonly type: string;
  readonly baseUrl: string;
  readonly supportsNativeToolSearch?: boolean | null;
}

// 运行时被端点拒绝原生 ToolSearch 的渠道（按 Provider + Base URL）；仅本进程有效，
// 重启或改地址后重新按配置尝试，避免一次中转故障永久关闭用户确认过的能力。
const rejectedNativeToolSearch = new Set<string>();

function nativeToolSearchKey(providerId: string, baseUrl: string): string {
  return `${providerId}\n${baseUrl}`;
}

export function resolveToolSearchCapability(
  providerId: string,
  api: ToolSearchProviderApi,
): ToolSearchCapability {
  const protocolSupported = api.type === "anthropic-messages";
  const key = nativeToolSearchKey(providerId, api.baseUrl);
  return Object.freeze({
    protocolSupported,
    // 兼容端点对 Anthropic beta 的支持无法预判：auto 只对用户确认或检测通过的渠道走原生，
    // 每次请求现读，运行时被拒后本进程内自动降级为 local。
    get defaultEnabled() {
      return (
        protocolSupported &&
        api.supportsNativeToolSearch === true &&
        !rejectedNativeToolSearch.has(key)
      );
    },
  });
}

export function markNativeToolSearchRejected(providerId: string, baseUrl: string): void {
  rejectedNativeToolSearch.add(nativeToolSearchKey(providerId, baseUrl));
}

/** 仅测试使用：清空进程内的拒绝记录。 */
export function resetNativeToolSearchRejections(): void {
  rejectedNativeToolSearch.clear();
}

const NATIVE_TOOL_SEARCH_REJECTION_PATTERN =
  /defer_loading|tool_reference|tool[_ ]search|advanced-tool-use|anthropic-beta/i;

/** 端点不认识原生 ToolSearch 时会以 4xx 指出 beta 头或 defer_loading / tool_reference 字段。 */
export function isNativeToolSearchRejection(error: unknown): boolean {
  const unwrapped = unwrapRetryError(error);
  const status = getStatusCode(unwrapped);
  if (status !== 400 && status !== 422) return false;
  const seen = new Set<unknown>();
  for (let current: unknown = unwrapped; current && !seen.has(current); ) {
    seen.add(current);
    const text = [
      current instanceof Error ? current.message : "",
      APICallError.isInstance(current) ? (current.responseBody ?? "") : "",
    ].join("\n");
    if (NATIVE_TOOL_SEARCH_REJECTION_PATTERN.test(text)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export function toolSearchHeaders(headers: Record<string, string> | undefined, enabled?: boolean) {
  if (!enabled) return headers;
  const result = { ...headers };
  const key =
    Object.keys(result).find((name) => name.toLowerCase() === "anthropic-beta") ?? "anthropic-beta";
  result[key] = [
    ...new Set([
      ...(result[key]
        ?.split(",")
        .map((value) => value.trim())
        .filter(Boolean) ?? []),
      TOOL_SEARCH_BETA,
    ]),
  ].join(",");
  return result;
}

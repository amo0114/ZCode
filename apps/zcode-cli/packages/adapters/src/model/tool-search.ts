import { TOOL_SEARCH_BETA, type ToolSearchCapability } from "@zcode/contracts";

export function resolveToolSearchCapability(apiType: string): ToolSearchCapability {
  // 原生 ToolSearch 依赖 Anthropic beta，兼容端点支持程度不一；auto 因此只走 local，native 需显式选择。
  return Object.freeze({ protocolSupported: apiType === "anthropic-messages", defaultEnabled: false });
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

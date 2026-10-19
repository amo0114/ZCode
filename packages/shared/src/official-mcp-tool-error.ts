/**
 * 已下线的官方 Server MCP 曾在 tool result display 里写入 `unavailable.code`。
 * 新链路不再产生该字段；row / display schema 均为 strict，历史 transcript 仍可能带有这些值，
 * 因此只保留值域供 schema 校验，不再解析或消费。
 */
export const OFFICIAL_MCP_TOOL_ERROR_CODES = ["quota_exceeded", "coding_plan_required"] as const;

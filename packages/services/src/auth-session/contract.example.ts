import type { IAuthSessionReader } from "./contract.js";

/** 消费方只读身份；没有登录渠道或未登录时按匿名处理。 */
export async function exampleTelemetryUserId(reader: IAuthSessionReader): Promise<string> {
  return (await reader.getActiveIdentity())?.accountId ?? "";
}

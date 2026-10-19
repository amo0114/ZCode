import type { OAuthProviderId, OAuthUserProfile } from "@zcode/shared";

export interface AuthSessionIdentity {
  readonly channelId: OAuthProviderId;
  readonly accountId: string;
}

/** Host 进程内只读端口，不跨 RPC，读取不产生副作用 */
export interface IAuthSessionReader {
  getActiveIdentity(): Promise<AuthSessionIdentity | null>;
  loadActiveProfile(): Promise<OAuthUserProfile | null>;
}

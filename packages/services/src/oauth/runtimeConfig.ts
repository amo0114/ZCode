import type { OAuthProviderId } from "@zcode/shared";

/** Provider 运行时配置（仅 host process 可见，敏感项不得进入 renderer） */
export interface OAuthProviderRuntimeConfig {
  id: OAuthProviderId;
  displayName: string;
  enabled: boolean;
  order: number;
  authorizeUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  appId: string;
  redirectUri: string;
  appSecret?: string;
}

/** OAuth 全局运行时配置 */
export interface OAuthRuntimeConfig {
  providers: OAuthProviderRuntimeConfig[];
}

/** 生产环境当前没有内置登录渠道。 */
export function createOAuthRuntimeConfig(): OAuthRuntimeConfig {
  return { providers: [] };
}

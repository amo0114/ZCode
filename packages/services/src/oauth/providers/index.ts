import type { OAuthProviderId } from "@zcode/shared";
import type { OAuthProviderRuntimeConfig, OAuthRuntimeConfig } from "../runtimeConfig.js";
import type { OAuthProviderAdapter } from "./providerAdapter.js";

type OAuthProviderAdapterFactory = (
  config: OAuthProviderRuntimeConfig,
) => OAuthProviderAdapter;

/**
 * 生产登录渠道注册表，当前为空。接入新渠道见 `auth-session/CONTRACT.md`「新渠道接入清单」。
 */
const OAUTH_PROVIDER_ADAPTER_FACTORIES: Readonly<Record<string, OAuthProviderAdapterFactory>> = {};

export const REGISTERED_OAUTH_PROVIDER_IDS: readonly OAuthProviderId[] = Object.keys(
  OAUTH_PROVIDER_ADAPTER_FACTORIES,
);

/** 根据运行时配置创建可用 provider adapter；未注册的渠道配置直接忽略。 */
export function createOAuthProviderAdapters(config: OAuthRuntimeConfig): OAuthProviderAdapter[] {
  return config.providers.flatMap((providerConfig) => {
    const factory = OAUTH_PROVIDER_ADAPTER_FACTORIES[providerConfig.id];
    return factory ? [factory(providerConfig)] : [];
  });
}

export type { OAuthProviderAdapter, OAuthProviderContext } from "./providerAdapter.js";

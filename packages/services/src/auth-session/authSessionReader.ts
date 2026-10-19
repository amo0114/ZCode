import { isCredentialDecryptError, type OAuthProviderId } from "@zcode/shared";
import type { ICredentialService } from "../credential/credential.js";
import { REGISTERED_OAUTH_PROVIDER_IDS } from "../oauth/providers/index.js";
import { parseOAuthUserProfile } from "../oauth/repo/oauthCredentialRepo.js";
import type { IAuthSessionReader } from "./contract.js";

const ACTIVE_PROVIDER_KEY = "oauth:active_provider";

/**
 * 只认已注册渠道：旧版本留在磁盘上的 `oauth:*` 凭据（I4）不属于任何注册渠道，读到也按未登录处理。
 * 解密失败同样按未登录处理，清理交给 OAuthService，读取方不做半套修复。
 */
export function createAuthSessionReader(
  credentialService: Pick<ICredentialService, "load">,
  registeredProviderIds: readonly OAuthProviderId[] = REGISTERED_OAUTH_PROVIDER_IDS,
): IAuthSessionReader {
  const loadActiveProfile = async () => {
    try {
      const provider = (await credentialService.load(ACTIVE_PROVIDER_KEY))?.trim();
      if (!provider || !registeredProviderIds.includes(provider)) {
        return null;
      }
      const raw = await credentialService.load(`oauth:${provider}:user_info`);
      const profile = raw ? parseOAuthUserProfile(raw) : null;
      return profile ? { provider, profile } : null;
    } catch (error) {
      if (isCredentialDecryptError(error)) {
        return null;
      }
      throw error;
    }
  };

  return {
    async getActiveIdentity() {
      const active = await loadActiveProfile();
      return active ? { channelId: active.provider, accountId: active.profile.id } : null;
    },
    async loadActiveProfile() {
      return (await loadActiveProfile())?.profile ?? null;
    },
  };
}

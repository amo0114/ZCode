import type { OAuthProviderId, OAuthTokenSet, OAuthUserProfile } from "@zcode/shared";
import { isCredentialDecryptError } from "@zcode/shared";
import type { ICredentialService } from "../../credential/credential.js";

const ACTIVE_PROVIDER_KEY = "oauth:active_provider";

interface OAuthCredentialRepoOptions {
  /** 已注册渠道；凭据损坏时只清理这些渠道的命名空间，不误删 SSH 等独立凭据。 */
  providerIds?: readonly OAuthProviderId[];
}

function accessTokenKey(provider: OAuthProviderId): string {
  return `oauth:${provider}:access_token`;
}

function refreshTokenKey(provider: OAuthProviderId): string {
  return `oauth:${provider}:refresh_token`;
}

function userInfoKey(provider: OAuthProviderId): string {
  return `oauth:${provider}:user_info`;
}

export function parseOAuthUserProfile(raw: string): OAuthUserProfile | null {
  try {
    const parsed = JSON.parse(raw) as Partial<OAuthUserProfile>;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.username !== "string" ||
      typeof parsed.displayName !== "string"
    ) {
      return null;
    }
    const avatarUrl = typeof parsed.avatarUrl === "string" ? parsed.avatarUrl : undefined;
    const rawProfile =
      typeof parsed.rawProfile === "object" && parsed.rawProfile !== null
        ? parsed.rawProfile
        : undefined;
    return {
      id: parsed.id,
      username: parsed.username,
      displayName: parsed.displayName,
      ...(avatarUrl ? { avatarUrl } : {}),
      ...(rawProfile ? { rawProfile } : {}),
    };
  } catch {
    return null;
  }
}

/** OAuth 凭据仓储：`oauth:<channelId>:*` 命名空间 + `oauth:active_provider` 指针。 */
export class OAuthCredentialRepo {
  private readonly providerIds: readonly OAuthProviderId[];

  constructor(
    private readonly credentialService: ICredentialService,
    options: OAuthCredentialRepoOptions = {},
  ) {
    this.providerIds = options.providerIds ?? [];
  }

  async getActiveProvider(): Promise<OAuthProviderId | null> {
    try {
      return await this.credentialService.load(ACTIVE_PROVIDER_KEY);
    } catch (error) {
      if (!isCredentialDecryptError(error)) {
        throw error;
      }
      await this.clearCorruptOAuthSession();
      return null;
    }
  }

  async setActiveProvider(provider: OAuthProviderId | null): Promise<void> {
    if (!provider) {
      await this.credentialService.delete(ACTIVE_PROVIDER_KEY);
      return;
    }
    await this.credentialService.save(ACTIVE_PROVIDER_KEY, provider);
  }

  async loadActiveTokenSet(): Promise<OAuthTokenSet | null> {
    const provider = await this.getActiveProvider();
    return provider ? this.loadTokenSet(provider) : null;
  }

  async saveActiveTokenSet(tokenSet: OAuthTokenSet): Promise<void> {
    const provider = await this.getActiveProvider();
    if (!provider) {
      throw new Error("保存当前登录 token 前缺少 active provider");
    }
    await this.saveTokenSet(provider, tokenSet);
  }

  async loadActiveUserProfile(): Promise<OAuthUserProfile | null> {
    const provider = await this.getActiveProvider();
    return provider ? this.loadUserProfile(provider) : null;
  }

  async saveActiveUserProfile(profile: OAuthUserProfile): Promise<void> {
    const provider = await this.getActiveProvider();
    if (!provider) {
      throw new Error("保存当前登录 user 前缺少 active provider");
    }
    await this.saveUserProfile(provider, profile);
  }

  async clearActiveSession(): Promise<void> {
    const activeProvider = await this.getActiveProvider();
    if (activeProvider) {
      await this.clearProvider(activeProvider);
    }
    await this.credentialService.delete(ACTIVE_PROVIDER_KEY);
  }

  async loadTokenSet(provider: OAuthProviderId): Promise<OAuthTokenSet | null> {
    try {
      const accessToken = await this.credentialService.load(accessTokenKey(provider));
      if (!accessToken) {
        return null;
      }
      const refreshToken = await this.credentialService.load(refreshTokenKey(provider));
      return { accessToken, ...(refreshToken ? { refreshToken } : {}) };
    } catch (error) {
      if (!isCredentialDecryptError(error)) {
        throw error;
      }
      await this.clearCorruptOAuthSession();
      return null;
    }
  }

  async saveTokenSet(provider: OAuthProviderId, tokenSet: OAuthTokenSet): Promise<void> {
    await this.credentialService.save(accessTokenKey(provider), tokenSet.accessToken);
    if (tokenSet.refreshToken) {
      await this.credentialService.save(refreshTokenKey(provider), tokenSet.refreshToken);
    } else {
      await this.credentialService.delete(refreshTokenKey(provider));
    }
  }

  async loadUserProfile(provider: OAuthProviderId): Promise<OAuthUserProfile | null> {
    let raw: string | null;
    try {
      raw = await this.credentialService.load(userInfoKey(provider));
    } catch (error) {
      if (!isCredentialDecryptError(error)) {
        throw error;
      }
      await this.clearCorruptOAuthSession();
      return null;
    }
    return raw ? parseOAuthUserProfile(raw) : null;
  }

  async saveUserProfile(provider: OAuthProviderId, profile: OAuthUserProfile): Promise<void> {
    await this.credentialService.save(userInfoKey(provider), JSON.stringify(profile));
  }

  async clearUserProfile(provider: OAuthProviderId): Promise<void> {
    await this.credentialService.delete(userInfoKey(provider));
  }

  async clearProvider(provider: OAuthProviderId): Promise<void> {
    await this.credentialService.delete(accessTokenKey(provider));
    await this.credentialService.delete(refreshTokenKey(provider));
    await this.credentialService.delete(userInfoKey(provider));
  }

  async clearAll(providers: readonly OAuthProviderId[]): Promise<void> {
    for (const provider of providers) {
      await this.clearProvider(provider);
    }
    await this.setActiveProvider(null);
  }

  private async clearCorruptOAuthSession(): Promise<void> {
    // AES-GCM 解密失败说明当前运行时已经无法信任本地 OAuth 登录态，等价于强制登出所有已注册渠道。
    for (const provider of this.providerIds) {
      await this.clearProvider(provider);
    }
    await this.credentialService.delete(ACTIVE_PROVIDER_KEY);
  }
}

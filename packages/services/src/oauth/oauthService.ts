import type {
  OAuthCachedSessionRestoreResult,
  OAuthCallbackResult,
  OAuthProviderId,
  OAuthProviderMeta,
  OAuthStartResponse,
  OAuthTokenSet,
  OAuthUserProfile,
  UserInfo,
} from "@zcode/shared";
import type { ICredentialService } from "../credential/credential.js";
import { createServiceLogger } from "../logger/serviceLogger.js";
import type { IOAuthService } from "./oauth.js";
import { OAuthFlowCoordinator } from "./oauthFlowCoordinator.js";
import { OAuthSessionStore } from "./oauthSessionStore.js";
import {
  createOAuthProviderAdapters,
  type OAuthProviderAdapter,
  type OAuthProviderContext,
} from "./providers/index.js";
import { OAuthCredentialRepo } from "./repo/oauthCredentialRepo.js";
import { createOAuthRuntimeConfig } from "./runtimeConfig.js";

const log = createServiceLogger("oauthService");

interface OAuthServiceDependencies {
  adapters?: OAuthProviderAdapter[];
  now?: () => number;
}

function toUserInfo(profile: OAuthUserProfile): UserInfo {
  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.displayName,
    ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
  };
}

function isUnauthorizedError(error: Error): boolean {
  const lowerMessage = error.message.toLowerCase();
  return (
    /\b401\b|\b403\b/.test(lowerMessage) ||
    lowerMessage.includes("unauthorized") ||
    lowerMessage.includes("forbidden")
  );
}

/**
 * OAuth 认证服务门面（host process）。
 *
 * 渠道来自 adapter 注册表；flow 状态由 OAuthFlowCoordinator 持有，凭据写入只经过 OAuthSessionStore。
 */
export class OAuthService implements IOAuthService {
  private readonly adapters = new Map<OAuthProviderId, OAuthProviderAdapter>();
  private readonly repo: OAuthCredentialRepo;
  private readonly flows = new OAuthFlowCoordinator();
  private readonly sessions: OAuthSessionStore;
  private readonly now: () => number;

  constructor(credentialService: ICredentialService, dependencies: OAuthServiceDependencies = {}) {
    this.now = dependencies.now ?? Date.now;
    for (const adapter of dependencies.adapters ??
      createOAuthProviderAdapters(createOAuthRuntimeConfig())) {
      this.adapters.set(adapter.providerId, adapter);
    }
    const providerIds = [...this.adapters.keys()];
    this.repo = new OAuthCredentialRepo(credentialService, { providerIds });
    this.sessions = new OAuthSessionStore(this.repo, () => providerIds);
  }

  async getProviders(): Promise<OAuthProviderMeta[]> {
    return [...this.adapters.values()]
      .map((adapter) => adapter.meta)
      .filter((meta) => meta.enabled)
      .sort((a, b) => a.order - b.order);
  }

  async getActiveProvider(): Promise<OAuthProviderId | null> {
    return this.repo.getActiveProvider();
  }

  async restoreCachedSessionState(): Promise<OAuthCachedSessionRestoreResult> {
    // 只读登录成功时持久化的 user_info：短生命周期 token 过期不应把未主动退出的用户打回未登录。
    const cached = await this.sessions.loadCachedSession(
      (provider) => this.adapters.get(provider)?.meta.enabled === true,
    );
    if (!cached) {
      return { status: "signed-out" };
    }
    return { status: "authenticated", userInfo: toUserInfo(cached.profile) };
  }

  async restoreSession(): Promise<UserInfo | null> {
    const generation = this.sessions.generation;
    const activeProvider = await this.repo.getActiveProvider();
    if (!activeProvider) {
      return null;
    }
    const adapter = this.adapters.get(activeProvider);
    if (!adapter || !adapter.meta.enabled) {
      await this.repo.setActiveProvider(null);
      return null;
    }

    const tokenSet = await this.repo.loadActiveTokenSet();
    if (!tokenSet || !adapter.fetchUserInfo) {
      await this.logout();
      return null;
    }

    try {
      const profile = await this.runWithAdapterError(adapter, () =>
        adapter.fetchUserInfo!(tokenSet, this.createContext(adapter, "")),
      );
      await this.sessions.saveValidatedProfile(generation, activeProvider, profile);
      return toUserInfo(profile);
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      // 远端明确返回未授权时按退出流程清理，避免把过期 token 误判成已登录。
      if (isUnauthorizedError(normalized)) {
        log.info("restoreSession unauthorized, logging out", { provider: activeProvider });
        await this.logout();
        return null;
      }
      throw normalized;
    }
  }

  async startOAuth(provider: OAuthProviderId): Promise<OAuthStartResponse> {
    const adapter = this.getEnabledAdapter(provider);
    // 与进行中的回调落盘串行：旧 flow 若正在写凭据，必须先让它看到 flow 已失效再开始新 flow。
    await this.sessions.runExclusive(async () => this.flows.clear());
    const flow = this.flows.begin(adapter.providerId);
    return {
      provider: adapter.providerId,
      authorizeUrl: adapter.buildAuthorizeUrl(this.createContext(adapter, flow.state)),
      state: flow.state,
    };
  }

  async handleCallback(url: string): Promise<OAuthCallbackResult | null> {
    const flow = this.flows.matchCallback(url);
    const adapter = this.getAdapter(flow.provider);
    return this.sessions.runExclusive(async () => {
      if (!this.flows.isCurrent(flow)) return null;
      const callback = adapter.parseCallbackParams(url);
      const context = this.createContext(adapter, callback.state);
      const tokenSet = await this.runWithAdapterError(adapter, () =>
        adapter.exchangeToken(callback, context),
      );
      const profile = await this.loadProfileAfterExchange(adapter, tokenSet, context);
      // exchangeToken 期间用户可能取消或切换到新 flow，旧请求返回后不能再写回凭据。
      if (!this.flows.isCurrent(flow)) return null;
      await this.sessions.persistLogin(flow.provider, tokenSet, profile, () =>
        this.flows.isCurrent(flow),
      );
      this.flows.finish(flow);
      return { provider: flow.provider, userInfo: toUserInfo(profile) };
    });
  }

  async refreshToken(provider?: OAuthProviderId): Promise<void> {
    const generation = this.sessions.generation;
    const activeProvider = await this.repo.getActiveProvider();
    const targetProvider = provider ?? activeProvider;
    if (!targetProvider) {
      throw new Error("当前没有可用的登录 provider");
    }
    const adapter = this.getEnabledAdapter(targetProvider);
    if (!adapter.refreshToken) {
      throw new Error(
        `${adapter.meta.displayName} OAuth 暂未提供 refresh token 交换接口，请重新登录`,
      );
    }
    if (targetProvider !== activeProvider) {
      throw new Error("只能刷新当前 App 登录 provider，请重新登录");
    }
    const tokenSet = await this.repo.loadActiveTokenSet();
    if (!tokenSet?.refreshToken) {
      throw new Error("当前账号缺少 refresh_token，请重新登录");
    }
    const refreshed = await this.runWithAdapterError(adapter, () =>
      adapter.refreshToken!(tokenSet, this.createContext(adapter, "")),
    );
    await this.sessions.saveRefreshedTokenSet({
      expectedGeneration: generation,
      provider: targetProvider,
      previous: tokenSet,
      refreshed,
    });
  }

  async logout(provider?: OAuthProviderId): Promise<void> {
    const cleared = await this.sessions.clearActiveSession(
      provider ? async () => (await this.repo.getActiveProvider()) === provider : undefined,
    );
    const cancelProvider = provider ?? cleared?.provider;
    if (cancelProvider) {
      this.flows.cancel(cancelProvider);
    }
  }

  async logoutAll(): Promise<void> {
    await this.sessions.clearAll();
    this.flows.cancel();
  }

  async cancelPending(provider?: OAuthProviderId): Promise<void> {
    this.flows.cancel(provider);
  }

  private async loadProfileAfterExchange(
    adapter: OAuthProviderAdapter,
    tokenSet: OAuthTokenSet,
    context: OAuthProviderContext,
  ): Promise<OAuthUserProfile> {
    const fallbackProfile: OAuthUserProfile = {
      id: "unknown",
      username: "user",
      displayName: "User",
    };
    if (!adapter.fetchUserInfo) {
      return fallbackProfile;
    }
    try {
      return await this.runWithAdapterError(adapter, () =>
        adapter.fetchUserInfo!(tokenSet, context),
      );
    } catch {
      // 获取用户信息失败不阻塞登录
      return fallbackProfile;
    }
  }

  private createContext(adapter: OAuthProviderAdapter, state: string): OAuthProviderContext {
    return {
      providerId: adapter.providerId,
      state,
      redirectUri: adapter.redirectUri,
      now: this.now,
    };
  }

  private getAdapter(provider: OAuthProviderId): OAuthProviderAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`不支持的 OAuth provider: ${provider}`);
    }
    return adapter;
  }

  private getEnabledAdapter(provider: OAuthProviderId): OAuthProviderAdapter {
    const adapter = this.getAdapter(provider);
    if (!adapter.meta.enabled) {
      throw new Error(`OAuth provider 未启用: ${provider}`);
    }
    return adapter;
  }

  private async runWithAdapterError<T>(
    adapter: OAuthProviderAdapter,
    run: () => Promise<T>,
  ): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw adapter.normalizeError(error);
    }
  }
}

/** 工厂函数：创建使用生产渠道注册表的 OAuthService */
export function createOAuthService(credentialService: ICredentialService): OAuthService {
  return new OAuthService(credentialService);
}

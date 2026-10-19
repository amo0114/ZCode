import type { OAuthProviderId, OAuthTokenSet, OAuthUserProfile } from "@zcode/shared";
import type { OAuthCredentialRepo } from "./repo/oauthCredentialRepo.js";

interface ProviderSnapshot {
  provider: OAuthProviderId;
  tokenSet: OAuthTokenSet | null;
  profile: OAuthUserProfile | null;
}

interface ClearedOAuthSession {
  provider: OAuthProviderId;
  accountId: string | null;
}

/**
 * OAuth 凭据的唯一写入者。
 *
 * 登录落盘、退出、刷新写回都改同一组凭据；全部经过 `runExclusive` 串行化，并用 generation
 * 让「读到旧快照后才完成」的异步任务识别出会话已经变化，避免退出后复活凭据或覆盖新登录。
 */
export class OAuthSessionStore {
  private queue: Promise<unknown> = Promise.resolve();
  private generationValue = 0;

  constructor(
    private readonly repo: OAuthCredentialRepo,
    private readonly providerIds: () => readonly OAuthProviderId[],
  ) {}

  get generation(): number {
    return this.generationValue;
  }

  runExclusive<T>(run: () => Promise<T>): Promise<T> {
    const next = this.queue.catch(() => undefined).then(run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /**
   * 写入登录结果。调用方必须已持有 `runExclusive`。
   *
   * 同一时刻只允许一个渠道处于登录态：先清理其他已注册渠道，再写当前渠道；
   * 任一步之后 flow 失效（取消或被新 flow 替换）都回滚到写入前的完整快照。
   */
  async persistLogin(
    provider: OAuthProviderId,
    tokenSet: OAuthTokenSet,
    profile: OAuthUserProfile,
    isStillCurrent: () => boolean,
  ): Promise<void> {
    const others = this.providerIds().filter((id) => id !== provider);
    const snapshots: ProviderSnapshot[] = [];
    for (const id of [provider, ...others]) {
      snapshots.push({
        provider: id,
        tokenSet: await this.repo.loadTokenSet(id),
        profile: await this.repo.loadUserProfile(id),
      });
    }
    const previousActiveProvider = await this.repo.getActiveProvider();
    const rollback = async () => {
      for (const snapshot of snapshots) {
        if (snapshot.tokenSet) await this.repo.saveTokenSet(snapshot.provider, snapshot.tokenSet);
        else await this.repo.clearProvider(snapshot.provider);
        if (snapshot.profile) await this.repo.saveUserProfile(snapshot.provider, snapshot.profile);
        else await this.repo.clearUserProfile(snapshot.provider);
      }
      await this.repo.setActiveProvider(previousActiveProvider);
    };
    const assertCurrent = async () => {
      if (!isStillCurrent()) {
        await rollback();
        throw new Error("OAuth flow 已取消");
      }
    };

    this.generationValue += 1;
    for (const id of others) {
      await assertCurrent();
      await this.repo.clearProvider(id);
    }
    await assertCurrent();
    await this.repo.saveTokenSet(provider, tokenSet);
    await assertCurrent();
    await this.repo.saveUserProfile(provider, profile);
    await assertCurrent();
    await this.repo.setActiveProvider(provider);
    // active provider 写入无法被底层 credential IO 取消；失效 flow 必须整体回滚，
    // 不能只按 provider 清理，否则同渠道的新 flow 可能被旧 flow 误删。
    await assertCurrent();
  }

  /** 读取启动展示用的缓存身份；渠道未注册时清掉 active 指针，按未登录处理。 */
  async loadCachedSession(
    isRegistered: (provider: OAuthProviderId) => boolean,
  ): Promise<{ provider: OAuthProviderId; profile: OAuthUserProfile } | null> {
    const provider = await this.repo.getActiveProvider();
    if (!provider) {
      return null;
    }
    if (!isRegistered(provider)) {
      await this.runExclusive(async () => {
        if ((await this.repo.getActiveProvider()) === provider) {
          await this.repo.setActiveProvider(null);
        }
      });
      return null;
    }
    const profile = await this.repo.loadUserProfile(provider);
    return profile ? { provider, profile } : null;
  }

  /** 退出当前会话；`isCurrent` 为 false 时不清理（返回 null）。 */
  clearActiveSession(isCurrent?: () => Promise<boolean>): Promise<ClearedOAuthSession | null> {
    return this.runExclusive(async () => {
      if (isCurrent && !(await isCurrent())) return null;
      const provider = await this.repo.getActiveProvider();
      // 清理前保留原账号身份，不能在退出后再猜身份。
      const accountId = provider ? ((await this.repo.loadUserProfile(provider))?.id ?? null) : null;
      this.generationValue += 1;
      await this.repo.clearActiveSession();
      return provider ? { provider, accountId } : null;
    });
  }

  clearAll(): Promise<void> {
    return this.runExclusive(async () => {
      this.generationValue += 1;
      await this.repo.clearAll(this.providerIds());
    });
  }

  /** 刷新写回只在会话未变化、且 access token 仍是刷新前那一枚时生效。 */
  saveRefreshedTokenSet(input: {
    expectedGeneration: number;
    provider: OAuthProviderId;
    previous: OAuthTokenSet;
    refreshed: OAuthTokenSet;
  }): Promise<boolean> {
    return this.runExclusive(async () => {
      if (
        this.generationValue !== input.expectedGeneration ||
        (await this.repo.getActiveProvider()) !== input.provider ||
        (await this.repo.loadTokenSet(input.provider))?.accessToken !== input.previous.accessToken
      ) {
        return false;
      }
      await this.repo.saveTokenSet(input.provider, input.refreshed);
      return true;
    });
  }

  /** 远端校验成功后更新当前会话的展示资料；会话已变化时丢弃。 */
  saveValidatedProfile(
    expectedGeneration: number,
    provider: OAuthProviderId,
    profile: OAuthUserProfile,
  ): Promise<boolean> {
    return this.runExclusive(async () => {
      if (
        this.generationValue !== expectedGeneration ||
        (await this.repo.getActiveProvider()) !== provider
      ) {
        return false;
      }
      await this.repo.saveUserProfile(provider, profile);
      return true;
    });
  }
}

import { describe, expect, it, vi } from "vitest";
import {
  CREDENTIAL_DECRYPT_ERROR_CODE,
  type OAuthCallbackParams,
  type OAuthProviderId,
  type OAuthTokenSet,
  type OAuthUserProfile,
} from "@zcode/shared";
import type { ICredentialService } from "../src/credential/credential.js";
import { OAuthService, createOAuthService } from "../src/oauth/oauthService.js";
import type { OAuthProviderAdapter } from "../src/oauth/providers/index.js";

function createCredentialStore(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const service: ICredentialService = {
    load: async (key) => store.get(key) ?? null,
    save: async (key, value) => {
      store.set(key, value);
    },
    delete: async (key) => {
      store.delete(key);
    },
  };
  return { store, service };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface MockAdapterOptions {
  exchangeToken?: (params: OAuthCallbackParams) => Promise<OAuthTokenSet>;
  fetchUserInfo?: (tokenSet: OAuthTokenSet) => Promise<OAuthUserProfile>;
  refreshToken?: (tokenSet: OAuthTokenSet) => Promise<OAuthTokenSet>;
  enabled?: boolean;
}

function createMockAdapter(
  providerId: OAuthProviderId,
  options: MockAdapterOptions = {},
): OAuthProviderAdapter {
  return {
    providerId,
    meta: { id: providerId, displayName: `Mock ${providerId}`, enabled: options.enabled ?? true, order: 0 },
    redirectUri: "zcode://oauth/callback",
    parseCallbackParams(url) {
      const params = new URL(url).searchParams;
      return { state: params.get("state") ?? "", code: params.get("code") ?? "" };
    },
    buildAuthorizeUrl(context) {
      return `https://${providerId}.example/authorize?state=${context.state}`;
    },
    exchangeToken:
      options.exchangeToken ??
      (async (params) => ({ accessToken: `${providerId}-access-${params.code}`, refreshToken: "r1" })),
    fetchUserInfo:
      options.fetchUserInfo ??
      (async () => ({ id: `${providerId}-user`, username: "user", displayName: "User" })),
    ...(options.refreshToken ? { refreshToken: options.refreshToken } : {}),
    normalizeError: (error) => (error instanceof Error ? error : new Error(String(error))),
  };
}

function callbackUrl(state: string, code = "code-1"): string {
  return `zcode://oauth/callback?state=${state}&code=${code}`;
}

async function login(service: OAuthService, provider: OAuthProviderId, code = "code-1") {
  const { state } = await service.startOAuth(provider);
  return service.handleCallback(callbackUrl(state, code));
}

describe("OAuthService（零生产渠道）", () => {
  it("没有注册渠道时 getProviders 为空，启动恢复为 signed-out", async () => {
    const { service } = createCredentialStore({
      // 旧版本留在磁盘上的凭据不属于任何注册渠道，不能被恢复成登录态（I4/I7）。
      "oauth:active_provider": "zai",
      "oauth:zai:user_info": JSON.stringify({ id: "u", username: "u", displayName: "u" }),
    });
    const oauth = createOAuthService(service);
    await expect(oauth.getProviders()).resolves.toEqual([]);
    await expect(oauth.restoreCachedSessionState()).resolves.toEqual({ status: "signed-out" });
    await expect(oauth.startOAuth("zai")).rejects.toThrow("不支持的 OAuth provider");
  });
});

describe("OAuthService（mock 渠道契约）", () => {
  it("完整登录：start → callback → exchange → userinfo → 持久化", async () => {
    const { store, service } = createCredentialStore();
    const oauth = new OAuthService(service, { adapters: [createMockAdapter("mock")] });

    await expect(oauth.getProviders()).resolves.toEqual([
      { id: "mock", displayName: "Mock mock", enabled: true, order: 0 },
    ]);
    const started = await oauth.startOAuth("mock");
    expect(started.authorizeUrl).toBe(`https://mock.example/authorize?state=${started.state}`);

    await expect(oauth.handleCallback(callbackUrl(started.state))).resolves.toEqual({
      provider: "mock",
      userInfo: { id: "mock-user", username: "user", displayName: "User" },
    });
    expect(store.get("oauth:active_provider")).toBe("mock");
    expect(store.get("oauth:mock:access_token")).toBe("mock-access-code-1");
    expect(store.get("oauth:mock:refresh_token")).toBe("r1");
    await expect(oauth.restoreCachedSessionState()).resolves.toEqual({
      status: "authenticated",
      userInfo: { id: "mock-user", username: "user", displayName: "User" },
    });
  });

  it("state 不匹配时拒绝回调且不写凭据", async () => {
    const { store, service } = createCredentialStore();
    const oauth = new OAuthService(service, { adapters: [createMockAdapter("mock")] });
    await oauth.startOAuth("mock");
    await expect(oauth.handleCallback(callbackUrl("forged"))).rejects.toThrow(
      "OAuth state 不匹配或已过期",
    );
    expect(store.size).toBe(0);
  });

  it("超时后旧 state 失效", async () => {
    vi.useFakeTimers();
    try {
      const { service } = createCredentialStore();
      const oauth = new OAuthService(service, { adapters: [createMockAdapter("mock")] });
      const { state } = await oauth.startOAuth("mock");
      vi.advanceTimersByTime(5 * 60 * 1000);
      await expect(oauth.handleCallback(callbackUrl(state))).rejects.toThrow(
        "OAuth state 不匹配或已过期",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("取消后到达的回调不能写凭据", async () => {
    const { store, service } = createCredentialStore();
    const oauth = new OAuthService(service, { adapters: [createMockAdapter("mock")] });
    const { state } = await oauth.startOAuth("mock");
    await oauth.cancelPending("mock");
    await expect(oauth.handleCallback(callbackUrl(state))).rejects.toThrow(
      "OAuth state 不匹配或已过期",
    );
    expect(store.size).toBe(0);
  });

  it("exchange 期间取消：返回 null 且不写凭据", async () => {
    const exchange = deferred<OAuthTokenSet>();
    const { store, service } = createCredentialStore();
    const oauth = new OAuthService(service, {
      adapters: [createMockAdapter("mock", { exchangeToken: () => exchange.promise })],
    });
    const { state } = await oauth.startOAuth("mock");
    const pending = oauth.handleCallback(callbackUrl(state));
    await oauth.cancelPending();
    exchange.resolve({ accessToken: "late" });
    await expect(pending).resolves.toBeNull();
    expect(store.size).toBe(0);
  });

  it("exchange 期间开始新 flow：新 flow 排在旧回调落盘之后，最终以新 flow 为准", async () => {
    const firstExchange = deferred<OAuthTokenSet>();
    let calls = 0;
    const { store, service } = createCredentialStore();
    const oauth = new OAuthService(service, {
      adapters: [
        createMockAdapter("mock", {
          exchangeToken: async (params) => {
            calls += 1;
            return calls === 1 ? firstExchange.promise : { accessToken: `new-${params.code}` };
          },
        }),
      ],
    });
    const first = await oauth.startOAuth("mock");
    const firstCallback = oauth.handleCallback(callbackUrl(first.state, "old"));
    const secondStart = oauth.startOAuth("mock");
    firstExchange.resolve({ accessToken: "old-token" });
    await expect(firstCallback).resolves.toMatchObject({ provider: "mock" });
    const second = await secondStart;
    // 新 flow 开始后旧 state 失效。
    await expect(oauth.handleCallback(callbackUrl(first.state, "old"))).rejects.toThrow(
      "OAuth state 不匹配或已过期",
    );
    await expect(oauth.handleCallback(callbackUrl(second.state, "fresh"))).resolves.toMatchObject({
      provider: "mock",
    });
    expect(store.get("oauth:mock:access_token")).toBe("new-fresh");
  });

  it("登录第二个渠道时清理第一个渠道", async () => {
    const { store, service } = createCredentialStore();
    const oauth = new OAuthService(service, {
      adapters: [createMockAdapter("alpha"), createMockAdapter("beta")],
    });
    await login(oauth, "alpha");
    expect(store.get("oauth:alpha:access_token")).toBe("alpha-access-code-1");

    await login(oauth, "beta");
    expect(store.get("oauth:active_provider")).toBe("beta");
    expect(store.has("oauth:alpha:access_token")).toBe(false);
    expect(store.has("oauth:alpha:user_info")).toBe(false);
  });

  it("写入过程中 flow 失效时回滚到登录前的完整快照", async () => {
    const { store, service } = createCredentialStore();
    let invalidateOnSave: (() => Promise<void>) | null = null;
    const oauth = new OAuthService(
      {
        ...service,
        save: async (key, value) => {
          await service.save(key, value);
          // 新渠道 token 已写入后 flow 失效：必须回滚，不能留下半套凭据。
          if (key === "oauth:beta:access_token" && invalidateOnSave) await invalidateOnSave();
        },
      },
      { adapters: [createMockAdapter("alpha"), createMockAdapter("beta")] },
    );
    await login(oauth, "alpha");
    const before = new Map(store);
    invalidateOnSave = () => oauth.cancelPending("beta");

    await expect(login(oauth, "beta")).rejects.toThrow("OAuth flow 已取消");
    expect(new Map(store)).toEqual(before);
  });

  it("刷新 token 写回经过 generation 校验：退出后迟到的刷新不能复活凭据", async () => {
    const refresh = deferred<OAuthTokenSet>();
    const refreshStarted = deferred<void>();
    const { store, service } = createCredentialStore();
    const oauth = new OAuthService(service, {
      adapters: [
        createMockAdapter("mock", {
          refreshToken: () => {
            refreshStarted.resolve();
            return refresh.promise;
          },
        }),
      ],
    });
    await login(oauth, "mock");
    const refreshing = oauth.refreshToken();
    await refreshStarted.promise;
    await oauth.logout();
    refresh.resolve({ accessToken: "refreshed" });
    await refreshing;
    expect(store.has("oauth:mock:access_token")).toBe(false);
    expect(store.has("oauth:active_provider")).toBe(false);
  });

  it("会话未变化时刷新结果写回", async () => {
    const { store, service } = createCredentialStore();
    const oauth = new OAuthService(service, {
      adapters: [
        createMockAdapter("mock", {
          refreshToken: async () => ({ accessToken: "refreshed", refreshToken: "r2" }),
        }),
      ],
    });
    await login(oauth, "mock");
    await oauth.refreshToken();
    expect(store.get("oauth:mock:access_token")).toBe("refreshed");
    expect(store.get("oauth:mock:refresh_token")).toBe("r2");
  });

  it("logout 只清理当前会话；logoutAll 清理所有已注册渠道", async () => {
    const { store, service } = createCredentialStore({ "ssh:key": "keep" });
    const oauth = new OAuthService(service, {
      adapters: [createMockAdapter("alpha"), createMockAdapter("beta")],
    });
    await login(oauth, "alpha");
    await oauth.logout("beta");
    expect(store.get("oauth:active_provider")).toBe("alpha");
    await oauth.logout();
    expect(store.has("oauth:active_provider")).toBe(false);
    expect(store.has("oauth:alpha:access_token")).toBe(false);

    await login(oauth, "beta");
    await oauth.logoutAll();
    expect([...store.keys()]).toEqual(["ssh:key"]);
  });

  it("本地凭据解密失败时按未登录处理并清理已注册渠道", async () => {
    const { store, service } = createCredentialStore({ "ssh:key": "keep" });
    const oauth = new OAuthService(
      {
        ...service,
        load: async (key) => {
          if (key === "oauth:active_provider") {
            throw Object.assign(new Error("凭据解密失败：bad"), {
              code: CREDENTIAL_DECRYPT_ERROR_CODE,
            });
          }
          return service.load(key);
        },
      },
      { adapters: [createMockAdapter("mock")] },
    );
    store.set("oauth:mock:access_token", "stale");
    await expect(oauth.restoreCachedSessionState()).resolves.toEqual({ status: "signed-out" });
    expect([...store.keys()]).toEqual(["ssh:key"]);
  });

  it("restoreSession 遇到未授权时退出", async () => {
    const { store, service } = createCredentialStore();
    let unauthorized = false;
    const oauth = new OAuthService(service, {
      adapters: [
        createMockAdapter("mock", {
          fetchUserInfo: async () => {
            if (unauthorized) throw new Error("401 Unauthorized");
            return { id: "mock-user", username: "user", displayName: "User" };
          },
        }),
      ],
    });
    await login(oauth, "mock");
    unauthorized = true;
    await expect(oauth.restoreSession()).resolves.toBeNull();
    expect(store.has("oauth:active_provider")).toBe(false);
  });
});

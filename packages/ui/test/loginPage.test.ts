import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const oauthState = vi.hoisted(() => ({
  status: "idle",
  error: null as string | null,
  loadingProviders: true,
  providers: [] as Array<{
    id: string;
    displayName: string;
    enabled: boolean;
    order: number;
  }>,
}));

// 静态渲染也会构造登录页窗控，使用与桌面入口一致的平台依赖。
vi.mock("@/hooks/usePlatform.js", () => ({
  usePlatform: () => ({ executeDesktopCommand: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock("@/hooks/useOAuth.js", () => ({
  useOAuth: () => ({
    startLogin: vi.fn(),
    cancel: vi.fn(),
    reset: vi.fn(),
    status: oauthState.status,
    error: oauthState.error,
    providers: oauthState.providers,
    activeProvider: null,
    loadingProviders: oauthState.loadingProviders,
    pendingProvider: null,
    refreshProviders: vi.fn(),
  }),
}));

vi.mock("@/i18n/IntlProvider.js", () => ({
  useZCodeIntl: () => ({
    intl: {
      formatMessage: ({ id }: { id: string }) => id,
    },
  }),
}));

vi.mock("@/store/StoreProvider.js", () => ({
  useZCodeStore: (selector: (state: unknown) => unknown) =>
    selector({
      user: null,
      oauthError: null,
      setOAuthError: vi.fn(),
    }),
}));

describe("WelcomeScreen", () => {
  it("使用项目选择页主题大背景和 background 登录面板", async () => {
    oauthState.status = "idle";
    oauthState.error = null;
    oauthState.loadingProviders = true;

    const { WelcomeScreen } = await import("@/WelcomeScreen.js");
    const html = renderToStaticMarkup(createElement(WelcomeScreen, { onComplete: vi.fn() }));

    expect(html).toContain("overflow-hidden bg-background");
    expect(html).toContain("absolute inset-0");
    expect(html).toContain("bg-[linear-gradient");
    expect(html).toContain("bg-background");
    expect(html).toContain("border-popover-border");
    expect(html).toContain("shadow-md");
    expect(html).toContain("<h1");
    expect(html).not.toContain("DialogTitle");
  });

  it("登录报错使用 warning 样式并居中文案", async () => {
    oauthState.status = "error";
    oauthState.error = "登录失败，请重试";
    oauthState.loadingProviders = false;

    const { WelcomeScreen } = await import("@/WelcomeScreen.js");
    const html = renderToStaticMarkup(createElement(WelcomeScreen, { onComplete: vi.fn() }));

    expect(html).toContain("border-warning/40");
    expect(html).toContain("bg-warning/10");
    expect(html).toContain("text-warning");
    expect(html).toContain("text-center");
    expect(html).toContain("登录失败，请重试");
    expect(html).not.toContain("bg-destructive text-destructive-foreground");
  });

  it("零登录渠道时只保留 API Key 入口，不渲染登录按钮或无渠道告警（I7）", async () => {
    oauthState.status = "idle";
    oauthState.error = null;
    oauthState.loadingProviders = false;
    oauthState.providers = [];

    const { WelcomeScreen } = await import("@/WelcomeScreen.js");
    const html = renderToStaticMarkup(createElement(WelcomeScreen, { onComplete: vi.fn() }));

    expect(html).toContain("login.useApiKey");
    expect(html).not.toContain("login.oauth.button");
    expect(html).not.toContain("login.oauth.noProviders");
  });

  it("有注册渠道时按 getProviders() 渲染通用登录按钮", async () => {
    oauthState.status = "idle";
    oauthState.error = null;
    oauthState.loadingProviders = false;
    oauthState.providers = [{ id: "mock", displayName: "Mock", enabled: true, order: 0 }];

    const { WelcomeScreen } = await import("@/WelcomeScreen.js");
    const html = renderToStaticMarkup(createElement(WelcomeScreen, { onComplete: vi.fn() }));

    expect(html).toContain("login.oauth.button");
    expect(html).toContain("oauth-login-button");
  });
});

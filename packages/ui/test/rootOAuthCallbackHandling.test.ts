import { describe, expect, it, beforeEach, vi } from "vitest";

const reportAppTelemetryEventMock = vi.fn(async () => {});

vi.mock("@/lib/appTelemetry.js", () => ({
  reportAppTelemetryEvent: reportAppTelemetryEventMock,
}));

vi.mock("@/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("handleOAuthCallbackSuccess", () => {
  beforeEach(() => {
    reportAppTelemetryEventMock.mockClear();
  });

  it("应用登录回调会更新 user、清理错误、刷新 Provider 并上报登录埋点", async () => {
    const { handleOAuthCallbackSuccess } = await import("@/root/useRootOAuthEffects.js");
    const setUser = vi.fn();
    const setOAuthError = vi.fn();
    const refreshProviderState = vi.fn(async () => {});
    const platform = {
      reportTelemetryEvent: vi.fn(async () => {}),
    };

    await handleOAuthCallbackSuccess({
      result: {
        provider: "mock",
        userInfo: {
          id: "user-1",
          username: "bigmodel-user",
          displayName: "BigModel User",
        },
      },
      platform,
      refreshProviderState,
      setUser,
      setOAuthError,
    });

    expect(setUser).toHaveBeenCalledWith({
      id: "user-1",
      username: "bigmodel-user",
      displayName: "BigModel User",
    });
    expect(setOAuthError).toHaveBeenCalledWith(null);
    expect(refreshProviderState).toHaveBeenCalledOnce();
    expect(reportAppTelemetryEventMock).toHaveBeenCalledWith(
      platform,
      expect.objectContaining({
        elementName: "app_login_success",
        eventExtraDetail: { login_provider: "mock" },
      }),
      "Root",
    );
  });
});

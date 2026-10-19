import type { OAuthProviderMeta } from "@zcode/shared";
import { describe, expect, it } from "vitest";
import { resolveLoginRetryProvider } from "@/WelcomeScreen.js";

function createProvider(
  overrides: Partial<OAuthProviderMeta>,
): OAuthProviderMeta {
  return {
    id: overrides.id ?? "custom-oauth",
    displayName: overrides.displayName ?? "Custom OAuth",
    enabled: overrides.enabled ?? true,
    order: overrides.order ?? 10,
  };
}

describe("resolveLoginRetryProvider", () => {
  it("OAuth 失败后优先沿用刚才失败的 provider，而不是回退到 providers[0]", () => {
    const providers = [
      createProvider({
        id: "alpha",
        displayName: "Alpha",
        order: 0,
      }),
      createProvider({
        id: "beta",
        displayName: "Beta",
        order: 1,
      }),
    ];

    expect(
      resolveLoginRetryProvider({
        pendingProvider: null,
        lastAttemptProvider: "beta",
        providers,
      }),
    ).toBe("beta");
  });

  it("等待态取消前仍优先使用当前 pending provider", () => {
    const providers = [
      createProvider({
        id: "alpha",
        displayName: "Alpha",
        order: 0,
      }),
    ];

    expect(
      resolveLoginRetryProvider({
        pendingProvider: "beta",
        lastAttemptProvider: "alpha",
        providers,
      }),
    ).toBe("beta");
  });
});

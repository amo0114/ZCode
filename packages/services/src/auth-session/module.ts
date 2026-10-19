/**
 * auth-session 模块清单（architecture-governance managed 模块）。
 * 只读地暴露当前 App 登录身份；写入由 oauth 模块的 OAuthSessionStore 独占。
 */
export const authSessionModule = {
  id: "auth-session",
  requires: ["services", "shared"],
  provides: ["auth-session-reader"],
  publicEntrypoints: ["contract.ts", "authSessionReader.ts"],
} as const;

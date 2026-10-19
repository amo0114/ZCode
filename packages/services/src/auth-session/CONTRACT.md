# auth-session

只读端口 `IAuthSessionReader`：给 telemetry、onboarding、plugin UI 账号绑定等 Host 内消费方读取当前 App 登录身份。

## 不变量

- 读取不产生副作用：不清理、不迁移、不刷新凭据；凭据写入只经过 `oauth/oauthSessionStore.ts`。
- 只认已注册渠道（`oauth/providers/index.ts` 的工厂注册表）。旧版本留下的 `oauth:*` 凭据不会被读成登录身份。
- 生产环境当前没有注册渠道，因此结果恒为 `null`，消费方必须按匿名处理。
- 不跨 RPC；不提供按渠道读 token 的能力。

## 新渠道接入清单

1. 在 `packages/services/src/oauth/providers/` 实现 `OAuthProviderAdapter`。
2. 在 `providers/index.ts` 的 `OAUTH_PROVIDER_ADAPTER_FACTORIES` 注册工厂。
3. 在 `runtimeConfig.ts` 提供该渠道的 runtime config；敏感项只在 Host 侧注入。
4. 补渠道显示名 i18n 与 adapter fixture 测试。

消费方不需要改动。

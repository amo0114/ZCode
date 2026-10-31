# 产品品牌位置约定

## 背景

本仓库从 ZCode 分叉，需要把 **用户可见的品牌** 从 ZCode 剥离，但保留所有已经外泄的标识符（打包身份、深链、数据目录、协议名、上游归因头）。

产品名已定为 **Tenon**（木工榫头：不用钉子把两块木头咬死，隐喻「接进你已有的工作流」）。品牌名唯一事实源：`packages/shared/src/productBrand.ts` 的 `PRODUCT_NAME`。

## 三层分档

| 档               | 内容                                                                                                                                               | 本轮处理                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| A 用户可见品牌   | 界面文案、CLI/TUI 输出、原生对话框、托盘、关于、分享页、窗口标题                                                                                   | 改为读 `PRODUCT_NAME`，不再写死          |
| B 内部标识符     | `@zcode/*` 包名、`ZCODE_*` 环境变量、`~/.zcode` 数据目录、`.zcode-plugin/`、IPC `zcode:*`、localStorage key                                        | **不动**（需数据迁移，另立 spec）        |
| C 对外已发布契约 | `productName`/`appId`、`zcode://` scheme、`ZCode Protocol` 协议名、`zcode-plugins-official` 市场 id、`window.zcode`、`ZCode/<ver>` UA、`X-ZCode-*` | **不动**（改了会断已发布版本或上游服务） |

## 文案注入机制

### 1. 词条占位符 `{product}`

翻译词条里独立出现产品名的位置写成 `{product}`，由格式化出口统一注入，调用点不需要传参：

- `packages/ui/src/i18n/IntlProvider.tsx` → `createIntl()` 的 `formatMessage`
- `packages/ui/src/ErrorBoundary.tsx` → 自带的最小 formatter
- `packages/shared/src/desktopMenu.ts` → `formatDesktopMenuMessage()`（菜单、托盘、关于入口共用）

规则：调用方传入的 `values` 覆盖默认注入，因此 `{product}` 与业务占位符可以共存。

### 2. 复合标签带品牌前缀

`ZCode Agent` / `ZCode Server` / `ZCode Desktop` 这类复合标签统一写成 `{product} <功能词>`，由同一个占位符注入品牌名：

| 原文          | 现在          |
| ------------- | ------------- |
| ZCode Agent   | Tenon Agent   |
| ZCode Server  | Tenon Server  |
| ZCode Desktop | Tenon Desktop |
| ZCode MCP     | Tenon MCP     |
| ZCode 机器人  | Tenon 机器人  |

`ZCode Computer Use` 例外：它是已签名 CUA Helper `.app` 的显示名，必须与 macOS 权限列表逐字一致，见下方保留清单。

### 3. 硬编码模板串

不经过词条表的文本（about 对话框、强制更新窗、安装/右键菜单、CLI 输出、bot 消息）直接 `import { PRODUCT_NAME } from "@zcode/shared"` 拼进模板字符串。**不要在调用点重新写死字面量。**

## 刻意保留 ZCode 的位置

| 位置                                                                                                               | 原因                                                                                               |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `packages/desktop/scripts/desktop-product-identity.mjs`（productName/appId/linuxPackageName）                      | 旧版本原地升级链、Windows AUMID、已发布到 R2 的更新 feed 都绑定这个身份                            |
| `electron-builder.config.js` 的 `protocols.schemes: ["zcode"]`                                                     | 深链 `zcode://share/import`、OAuth 回调已随版本外泄                                                |
| `~/.zcode`、`.zcode/v2`、`.zcode/cli`、Electron userData `ZCode`                                                   | B 档；改动需要跨品牌目录迁移                                                                       |
| `packages/shared/src/zcode-protocol/index.ts` 的 `"ZCode Protocol"` + `z.literal`                                  | 与已部署的远端 agent 双向握手校验                                                                  |
| `packages/desktop/src/main/desktopLinuxDeepLinkRegistration.ts` 的 `Comment=ZCode Desktop App`                     | 作为 `.desktop` 归属判据，用于幂等判断历史写入                                                     |
| `packages/shared/src/zcode-source-headers.ts`、CLI `bootstrap/src/model-config.ts` 的 UA / `X-Title` / `X-ZCode-*` | 上游服务端按这些归因与计量                                                                         |
| `packages/services/src/zcode-agent/*` 的错误串（`ZCode agent transport closed` 等）                                | `packages/ui/src/v4/conversationProjectionStore.ts` 按字符串匹配做回收自愈分类，改文案会让自愈失效 |
| `packages/services/src/runtime-tools/appCaCert.ts` 的 CN/O                                                         | 改名会让系统里已信任的本地 CA 失效                                                                 |
| `packages/services/src/node.ts`、`desktop/src/main/cuaAccessibilitySettings.ts` 的 `ZCode Computer Use`            | 指向 macOS 系统权限列表里已签名的 Helper `.app` 显示名，单独改名会让用户对不上条目                 |
| `packages/desktop/build/`、`public/` 的应用图标                                                                    | 与保留的 productName 绑定                                                                          |
| `docs/` 下历史 spec 与 working-memory                                                                              | 记录的是当时的事实，改名会破坏可追溯性                                                             |

## 当前的已知不一致

应用内与 CLI 显示 `Tenon`，而系统层（Dock 名、macOS 菜单栏应用名、通知发送者、安装包与 `.app` 文件名、任务管理器进程名）仍是 `ZCode`。这是保留打包身份的必然结果。

**决策：打包身份切换放到单独的发版节点做，不在品牌剥离 PR 里顺手改。** 见下一节。

## 打包身份切换（待办，独立发版节点）

目标：让系统层也显示 Tenon。

### 要改的地方

| 文件                                                      | 改动                                                                                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/scripts/desktop-product-identity.mjs`   | `productName: "ZCode" → "Tenon"`、`appId: "dev.zcode.app" → "dev.tenon.app"`、`linuxExecutableName`/`linuxPackageName` 同步 |
| `packages/desktop/scripts/desktop-product-identity.d.mts` | 无改动（类型不变）                                                                                                          |
| `packages/zcode-cua/broker-helper-constants.js`           | `HELPER_APP_NAME` / `HELPER_DISPLAY_NAME` / `HELPER_BUNDLE_ID`（Helper 是独立签名的 `.app`，改名等于新应用，需重新授权）    |
| `packages/desktop/src/main/desktopRuntimeEnv.ts`          | `runtimeApplicationName` 的三个分支（Dev / Preview / 正式）                                                                 |
| `packages/desktop/electron-builder.config.js`             | `extraMetadata.homepage/author`、`maintainer`、`protocols[].name` 跟随                                                      |
| `packages/desktop/build/installer.nsh`                    | 安装器日志名与 `.zcode-install-manifest`（涉及升级识别，需要保留旧值判据）                                                  |
| `packages/desktop/test/desktopProductIdentity.test.ts`    | 断言里的 `dev.zcode.app` / `productName` 同步                                                                               |

### 代价（必须提前安排）

1. **macOS 自动更新断代**：新版 `.app` 目录名变化后，旧客户端的 updater 无法原地替换 `ZCode.app`，用户需手动下载重装一次。
2. **Windows 并排安装**：`appId` 变化后 AUMID 与快捷方式身份都变，Windows 会把新旧当两个应用，需在安装器里清理旧快捷方式/开始菜单项，否则用户机器上会出现两个入口。
3. **Electron userData 目录变化**（`appData/<runtimeApplicationName>`）：renderer 的 localStorage、IndexedDB、窗口状态会丢（会话数据在 `~/.zcode` 里，不受影响）。必要时加 `app.setPath("userData", 旧目录)` 或一次性迁移。
4. **已发布更新 feed**：R2 上 `latest.yml` 的 `url` 引用安装包文件名，改名后需同时上传新文件名并保留旧 manifest 一个版本，避免旧客户端 404。
5. **CUA Helper 重新授权**：Helper 的 bundle id 变化后，macOS 辅助功能/屏幕录制授权需用户重新授予。

### 顺序建议

单独 PR，先合并代码与迁移逻辑，在某个明确的版本号上一次性发布；发布说明里写清「需手动重装一次」。

## 定名后的操作

1. 改 `productBrand.ts` 的 `PRODUCT_NAME`。
2. 改 `desktop-product-identity.mjs` 的 `productName` / `appId` / `linuxExecutableName` / `linuxPackageName`，同步 CUA Helper 名（`packages/zcode-cua/broker-helper-constants.js`）。
3. 替换 `packages/desktop/build/` 与 `public/` 的图标资产。
4. 若决定改数据目录或深链，另写迁移 spec（B/C 档），不要在本约定下顺手改。

## 验收

1. 应用内与 CLI 可见文本不再出现 `ZCode`（`packages/*/src` 中保留清单以外的位置）。
2. `productName`、`appId`、`zcode://`、`~/.zcode` 与改造前完全一致。
3. `pnpm --filter @zcode/i18n test`、`pnpm --filter @zcode/tui test` 通过；`container-boot`、`help-menu-about` 两个 e2e 断言从 `PRODUCT_NAME` 派生而不是写死。

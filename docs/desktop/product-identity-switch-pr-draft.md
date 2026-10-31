# PR 说明草稿：打包身份切换到 Tenon

> 状态：**草稿，未实施**。本文只写清要改什么、为什么、风险与验收，等排到发版节点再开 PR。
> 关联：品牌剥离（本分支）已完成应用内与 CLI 的品牌替换，系统层仍是 `ZCode`；约定见
> [产品品牌位置约定](./product-brand-placement.md)。

## 标题建议

```
feat(desktop): switch packaging identity to Tenon
```

## 背景

品牌剥离那一轮只改了「用户看得见的产品名」：界面文案、CLI/TUI 输出、原生对话框、托盘、关于、分享页、窗口标题，全部改为从
`packages/shared/src/productBrand.ts` 的 `PRODUCT_NAME` 取值。

系统层没有跟着改，因为那里的名字不是文案，而是**安装与升级的身份**：

| 系统层位置                                 | 名字来源                                   | 当前值                                |
| ------------------------------------------ | ------------------------------------------ | ------------------------------------- |
| macOS `.app` 目录名、Dock 名、菜单栏应用名 | electron-builder `productName`             | `ZCode`                               |
| Windows AUMID、开始菜单/快捷方式           | `appId`                                    | `dev.zcode.app`                       |
| 安装包文件名                               | `artifactName` 模板（含 `productName`）    | `ZCode-<ver>-<platform>-<arch>.<ext>` |
| 通知发送者、任务管理器进程名               | `app.setName()` → `runtimeApplicationName` | `ZCode`                               |
| Electron userData 目录                     | `appData/<runtimeApplicationName>`         | `ZCode`                               |
| Linux 可执行名 / 包名 / 图标               | `linuxExecutableName` / `linuxPackageName` | `zcode`                               |
| CUA Helper `.app`                          | `HELPER_APP_NAME` 等                       | `ZCode Computer Use.app`              |

这些都是**已随旧版本外泄的契约**：已安装客户端、系统注册表、R2 上已发布的更新清单、macOS 权限授权都按旧值登记。改动即断代，所以单独一个 PR、单独一个发版节点。

## 改动范围

### 1. 打包身份

`packages/desktop/scripts/desktop-product-identity.mjs`

```diff
 const PRODUCTION_IDENTITY = Object.freeze({
   flavor: "production",
-  appId: "dev.zcode.app",
-  productName: "ZCode",
-  linuxExecutableName: "zcode",
-  linuxPackageName: "zcode",
+  appId: "dev.tenon.app",
+  productName: "Tenon",
+  linuxExecutableName: "tenon",
+  linuxPackageName: "tenon",
   cuaHelperInstallVariant: null,
 });

 const PREVIEW_IDENTITY = Object.freeze({
   flavor: "preview",
-  appId: "dev.zcode.app.preview",
-  productName: "ZCode Preview",
-  linuxExecutableName: "zcode-preview",
-  linuxPackageName: "zcode-preview",
+  appId: "dev.tenon.app.preview",
+  productName: "Tenon Preview",
+  linuxExecutableName: "tenon-preview",
+  linuxPackageName: "tenon-preview",
   cuaHelperInstallVariant: "preview",
 });
```

### 2. 运行时应用名

`packages/desktop/src/main/desktopRuntimeEnv.ts` 的 `runtimeApplicationName`：

```diff
 export const runtimeApplicationName =
   readRuntimeEnvOverride("ZCODE_DESKTOP_APPLICATION_NAME") ??
-  (isLocalDevelopmentRuntime ? "ZCode Dev" : isPreviewPackagedRuntime ? "ZCode Preview" : "ZCode");
+  (isLocalDevelopmentRuntime ? "Tenon Dev" : isPreviewPackagedRuntime ? "Tenon Preview" : "Tenon");
```

环境变量名 `ZCODE_DESKTOP_APPLICATION_NAME` 属于 B 档，**本 PR 不改**（e2e 与 CI 仍在用）。

### 3. CUA Helper

`packages/zcode-cua/broker-helper-constants.js`：

```diff
-export const HELPER_APP_NAME = "ZCode Computer Use.app";
-export const DEV_HELPER_APP_NAME = "ZCode Computer Use Dev.app";
-export const HELPER_DISPLAY_NAME = "ZCode Computer Use";
-export const HELPER_BUNDLE_ID = "dev.zcode.cua-helper";
-export const DEV_CUA_HELPER_BUNDLE_ID = "dev.zcode.cua-helper.dev";
+export const HELPER_APP_NAME = "Tenon Computer Use.app";
+export const DEV_HELPER_APP_NAME = "Tenon Computer Use Dev.app";
+export const HELPER_DISPLAY_NAME = "Tenon Computer Use";
+export const HELPER_BUNDLE_ID = "dev.tenon.cua-helper";
+export const DEV_CUA_HELPER_BUNDLE_ID = "dev.tenon.cua-helper.dev";
```

同步 `packages/desktop/src/renderer/cuaPermissionPanelMessages.ts` 的 `documentTitle`（它必须与系统权限列表里的 Helper 显示名逐字一致，否则「拖动图标到权限列表」会指错行）。

### 4. 跟随项

| 文件                                                      | 改动                                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------------------- |
| `packages/desktop/electron-builder.config.js`             | `extraMetadata.homepage` / `author`、`linux.maintainer`、`protocols[].name` |
| `packages/desktop/build/installer.nsh`                    | 安装器日志名、`.zcode-install-manifest` 路径一致性                          |
| `packages/desktop/scripts/patch-nsis-install-section.mjs` | 补丁标记串                                                                  |
| `packages/desktop/build/`、`public/`                      | 图标资产（当前仍是 Z 字形）                                                 |
| `packages/desktop/test/desktopProductIdentity.test.ts`    | `dev.zcode.app` / `productName` 断言                                        |
| `packages/desktop/scripts/devElectronAppBundle.mjs`       | 开发态 app 名与 bundle id                                                   |

## 不在本 PR 范围

| 项                                  | 原因                                                 |
| ----------------------------------- | ---------------------------------------------------- |
| `zcode://` 深链 scheme              | 已随版本外泄，改需并行注册新旧 scheme 一个版本周期   |
| `~/.zcode` 数据目录                 | 用户会话、插件、记忆都在里面，需要迁移逻辑，不是改名 |
| `@zcode/*` 包名、`ZCODE_*` 环境变量 | B 档，与产品名无关，改了只增冲突                     |
| `ZCode Protocol` 协议名             | 与已部署远端 agent 双向握手校验                      |
| `zcode-plugins-official` 市场 id    | 写进用户 config 的 `enabledPlugins`                  |
| `window.zcode` 插件 API             | 已文档化的插件作者契约                               |
| `ZCode/<ver>` UA、`X-ZCode-*`       | 上游服务端按这些归因计量                             |

## 修改前后行为

| 场景                                  | 改前                            | 改后                                                |
| ------------------------------------- | ------------------------------- | --------------------------------------------------- |
| 已装旧版用户打开 app                  | 正常                            | 正常，但**收不到新版本更新**（见风险 1）            |
| 旧版用户手动下载新版安装              | —                               | 安装为 `Tenon.app`，旧 `ZCode.app` 仍在，需手动删除 |
| 全新安装                              | `ZCode.app`                     | `Tenon.app`                                         |
| Windows 开始菜单                      | 一个 `ZCode` 入口               | 一个新 `Tenon` 入口，旧入口需安装器清理             |
| 应用内文案                            | `Tenon`（已改）                 | `Tenon`（不变）                                     |
| 会话与设置数据                        | `~/.zcode`                      | `~/.zcode`（不变，无迁移）                          |
| renderer 本地状态（主题、面板宽度等） | `appData/ZCode`                 | `appData/Tenon`（丢失，需迁移或接受重置）           |
| 电脑控制授权                          | 已授给 `ZCode Computer Use.app` | 需对 `Tenon Computer Use.app` 重新授权              |

## 风险与处置

### 1. macOS 自动更新断代（最高）

新版 `.app` 目录名变化后，旧客户端 updater 的目标路径 `ZCode.app` 不存在，无法原地替换。**处置**：发版说明明确「需手动下载重装一次」；`app-update.yml` 与 `latest.yml` 保留一个版本周期的旧文件名副本，避免旧客户端 404。

### 2. Windows 并排安装

`appId` 变化 → AUMID 与快捷方式身份全变，Windows 视作两个应用。**处置**：NSIS 安装段增加旧快捷方式/开始菜单项清理；或接受用户手动卸载旧版。需在真实 Windows 上验证「装新版后开始菜单只剩一个入口」。

### 3. Electron userData 目录

`appData/<appName>` 变化会让 localStorage / IndexedDB / 窗口状态从头开始。会话数据在 `~/.zcode`，不受影响。**处置**：优先做一次性迁移（旧目录存在且新目录不存在时 `fs.cp` + 写迁移标记）；不做迁移则在发版说明里写明「本地界面偏好会重置」。

### 4. R2 更新 feed

`latest.yml` 里的 `url` 引用安装包文件名。**处置**：上传新文件名，旧 manifest 与旧安装包保留一个版本周期，等存量客户端完成重装后再清理。

### 5. CUA Helper 重新授权

bundle id 变化等于新应用，macOS 辅助功能/屏幕录制授权需重新授予。**处置**：发版说明明确提示；设置页的电脑控制分区在检测到未授权时走既有引导流程，无需新增 UI。

### 6. 代码签名与公证

macOS 签名/公证按 bundle id 与 `.app` 名执行，改后需重新走一遍签名流水线，确认 `scripts/sign-macos-*` 与 `doctor-macos-release-app.sh` 里的硬编码路径同步更新。

## 验收

1. `pnpm typecheck` / `pnpm lint` / `pnpm architecture:check --changed` 全绿。
2. `pnpm test:engineering packages/desktop/test/desktopProductIdentity.test.ts` 通过（断言改为新身份）。
3. 本地打包：`ZCODE_ENV=production pnpm --filter @zcode/desktop run bundle`，确认产物名为 `Tenon-<ver>-<platform>-<arch>.<ext>`，`.app` 目录名为 `Tenon.app`。
4. 真实机器端到端：
   - macOS：Dock 名、菜单栏应用名、通知发送者、关于窗口、`ls ~/Library/Application Support/` 目录名。
   - Windows：开始菜单入口数量、快捷方式 AUMID（`shell:AppsFolder`）、任务管理器进程名。
   - Linux：`.desktop` 文件 `Name=`/`Icon=`、`/usr/share/icons/hicolor/*/apps/` 图标名。
5. 电脑控制：安装 CUA Helper 后，macOS 系统设置权限列表里显示 `Tenon Computer Use`，设置页引导文案能对上。
6. 升级链路：在装有旧版的机器上验证「旧版收不到更新 → 手动重装 → 新版能收到后续更新」。

## 发布顺序

1. 合并本 PR（代码与清理逻辑就位，但**不立即发版**）。
2. 在明确的版本号上一次性发布，同时上传新文件名安装包与保留旧 manifest。
3. 发版说明写清：需手动重装一次；本地界面偏好可能重置；电脑控制需重新授权。
4. 一个版本周期后清理 R2 上的旧文件名与旧 manifest。

/**
 * 产品品牌的唯一事实源。
 *
 * 背景：本仓库从 ZCode 分叉而来，用户可见的品牌已从 ZCode 剥离，并定名为 Tenon。
 * 所有界面文案、CLI 输出、原生提示都从这里取名字，不再各自写死。
 *
 * 命名：Tenon 是木工里的榫头——不用钉子就把两块木头咬死，隐喻「接进你已有的工作流」。
 *
 * 复合标签统一带品牌前缀：`Tenon Agent` / `Tenon Server` / `Tenon Desktop`。
 *
 * 仍未覆盖的层（改这些会断已发布版本、用户数据或上游服务）：
 * - 打包身份 productName/appId、深链 scheme `zcode://`、数据目录 `~/.zcode`；
 * - `@zcode/*` 包名、`ZCODE_*` 环境变量、`.zcode-plugin/` 插件目录；
 * - `ZCode Protocol` 协议名、`zcode-plugins-official` 市场 id、`window.zcode` 插件 API；
 * - `ZCode/<version>` User-Agent 与 `X-ZCode-*` 请求头（上游服务端按这些归因）。
 * 这些属于 B/C 档，需要独立的迁移方案；详见 docs/desktop/product-brand-placement.md。
 */

/** 产品名。改名只改这一行，其余位置都从这里派生。 */
export const PRODUCT_NAME = "Tenon";

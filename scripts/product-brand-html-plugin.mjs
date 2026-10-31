/**
 * HTML 入口的 `<title>` 在 JS 启动前就会显示给用户（窗口标题、浏览器标签页），
 * 无法 import TS 常量。这里用 `%PRODUCT_NAME%` 哨兵在 vite transformIndexHtml 阶段替换，
 * 让 HTML 不再写死品牌名。产品名来自各 vite config 从 `@zcode/shared/product-brand` 读到的值。
 */
export function createProductBrandHtmlPlugin(productName) {
  return {
    name: "zcode:product-brand-html",
    transformIndexHtml: {
      order: "pre",
      handler: (html) => html.replaceAll("%PRODUCT_NAME%", productName),
    },
  };
}

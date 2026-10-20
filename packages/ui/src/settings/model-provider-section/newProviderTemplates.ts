import type { ProviderSettingsView } from "@zcode/services";

// 智谱 Coding Plan 账号体系已下线，这两个模板仅为老用户已创建的 Provider 提供 baseUrl，
// 删除会使其失效；新建入口不再提供，避免引导用户选择已不存在的套餐接入方式。
const LEGACY_ONLY_TEMPLATE_IDS = new Set(["zai-api", "bigmodel-api"]);

/** 新建 Provider 入口（设置页与欢迎页）共用的可选 Template。 */
export function selectNewProviderTemplates(
  templates: ProviderSettingsView["providerTemplates"],
): ProviderSettingsView["providerTemplates"] {
  return templates.filter((template) => !LEGACY_ONLY_TEMPLATE_IDS.has(template.templateId));
}

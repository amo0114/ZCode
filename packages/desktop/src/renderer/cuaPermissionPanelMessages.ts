import type { CuaPermissionKind, Locale } from "@zcode/shared";

export interface CuaPermissionPanelMessages {
  documentTitle: string;
  dragTitle: string;
  hintPrefix: string;
  permissionLabel: string;
  hintSuffix: string;
  completion: string;
}

// 品牌剥离保留项：这里的文档标题用于「拖动图标到系统权限列表」的指引，
// 必须与已签名的 CUA Helper .app 显示名（packages/zcode-cua/broker-helper-constants.js）
// 逐字一致，否则用户在 macOS 权限列表里找不到对应行。改名时两者要一起改。
const MESSAGES: Record<
  Locale,
  Omit<CuaPermissionPanelMessages, "permissionLabel"> & Record<CuaPermissionKind, string>
> = {
  "zh-CN": {
    documentTitle: "ZCode Computer Use 权限",
    dragTitle: "拖动我到上面的权限列表",
    hintPrefix: "把左边的图标拖进上方的",
    hintSuffix: "列表",
    completion: "松手即完成授权，无需再点开关",
    accessibility: "辅助功能",
    screen_recording: "屏幕录制",
  },
  "en-US": {
    documentTitle: "ZCode Computer Use Permissions",
    dragTitle: "Drag me to the permission list above",
    hintPrefix: "Drag the icon on the left into the ",
    hintSuffix: " list above",
    completion: "Release to grant access—no need to toggle the switch",
    accessibility: "Accessibility",
    screen_recording: "Screen Recording",
  },
};

export function resolveCuaPermissionPanelMessages(
  locale: Locale,
  permission: CuaPermissionKind,
): CuaPermissionPanelMessages {
  const messages = MESSAGES[locale];
  return {
    documentTitle: messages.documentTitle,
    dragTitle: messages.dragTitle,
    hintPrefix: messages.hintPrefix,
    permissionLabel: messages[permission],
    hintSuffix: messages.hintSuffix,
    completion: messages.completion,
  };
}

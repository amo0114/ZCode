import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceSidebarFooter } from "@/WorkspaceSidebarFooter.js";

vi.mock("@/ControlHintTooltip.js", () => ({
  ControlHintTooltip: ({ children, title }: { children: unknown; title: string }) =>
    createElement("span", { "data-tooltip-title": title }, children),
}));

vi.mock("@/WorkspaceWebRemoteControlTrigger.js", () => ({
  WorkspaceWebRemoteControlTrigger: () =>
    createElement("button", {
      "data-testid": "web-remote-control-trigger",
    }),
}));

vi.mock("@/hooks/usePlatform.js", () => ({
  usePlatform: () => ({
    executeDesktopCommand: vi.fn(),
    getDesktopZoomLevel: () => Promise.resolve({ zoomLevel: 0 }),
    onDesktopZoomLevelChanged: () => () => {},
    openExternal: vi.fn(),
  }),
}));

vi.mock("@/i18n/IntlProvider.js", () => ({
  useZCodeIntl: () => ({
    locale: "zh-CN",
    intl: {
      formatMessage: ({ id }: { id: string }) => id,
    },
  }),
}));

vi.mock("@/store/StoreProvider.js", () => ({
  useZCodeStore: (selector: (state: { isRestoringOAuthSession: boolean }) => unknown) =>
    selector({ isRestoringOAuthSession: false }),
}));

vi.mock("@/hooks/useSettingService.js", () => ({
  useSettings: () => ({
    settings: {},
    update: vi.fn(),
  }),
}));

describe("WorkspaceSidebarFooter web remote control tooltip", () => {
  it("keeps long profile names constrained inside the footer row", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceSidebarFooter, {
        theme: "dark",
        localeMenuValue: "zh-CN",
        onLocaleChange: () => {},
        onThemeChange: () => {},
        onSettingsButtonClick: () => {},
        user: {
          id: "user-long-name",
          username: "very-very-very-very-very-very-long-user-name",
          displayName: "VeryVeryVeryVeryVeryVeryVeryVeryLongDisplayName",
        },
      }),
    );

    expect(html).toContain("min-w-0 flex-1");
    expect(html).toContain("overflow-hidden");
    expect(html).toContain("text-left");
    expect(html).toContain("truncate text-ui-base font-semibold");
  });

  it("does not wrap the remote control trigger in a second tooltip", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceSidebarFooter, {
        theme: "dark",
        localeMenuValue: "zh-CN",
        onLocaleChange: () => {},
        onThemeChange: () => {},
        onSettingsButtonClick: () => {},
        workspacePath: "/tmp/project",
        isDesktop: true,
      }),
    );

    expect(html).toContain('data-testid="web-remote-control-trigger"');
    expect(html).not.toContain('data-tooltip-title="webRemoteControl.trigger"');
  });

  it("shows desktop zoom commands under an interface zoom submenu", () => {
    const source = readFileSync(
      resolve(process.cwd(), "packages/ui/src/WorkspaceSidebarFooter.tsx"),
      "utf8",
    );

    expect(source).toContain("{isDesktop ? (");
    expect(source).toContain('id: "sidebar.settings.interfaceZoom"');
    expect(source).toContain("<DropdownMenuSubContent");
    expect(source).toContain("DesktopCommandIds.ZoomIn");
    expect(source).toContain("DesktopCommandIds.ZoomOut");
    expect(source).toContain("DesktopCommandIds.ResetZoom");
    expect(source).toContain('id: "titleBar.menu.view.zoomIn"');
    expect(source).toContain('id: "titleBar.menu.view.zoomOut"');
    expect(source).toContain('id: "titleBar.menu.view.actualSize"');
  });

  it("keeps the interface zoom submenu gated to desktop mode", () => {
    const source = readFileSync(
      resolve(process.cwd(), "packages/ui/src/WorkspaceSidebarFooter.tsx"),
      "utf8",
    );

    expect(source).toContain("{isDesktop ? (");
    expect(source).toContain(") : null}");
  });

  it("keeps profile menu grouped as language theme zoom usage auth", () => {
    const source = readFileSync(
      resolve(process.cwd(), "packages/ui/src/WorkspaceSidebarFooter.tsx"),
      "utf8",
    );

    const localeIndex = source.indexOf('id: "settings.locale"');
    const themeIndex = source.indexOf('id: "settings.themeMode"');
    const zoomIndex = source.indexOf('id: "sidebar.settings.interfaceZoom"');
    const usageIndex = source.indexOf("data-testid={TID_SIDEBAR_CODING_PLAN_USAGE_BUTTON}");
    const loginIndex = source.indexOf('id: "app.login"');
    const logoutIndex = source.indexOf('id: "app.logout"');
    const separatorBeforeAuthIndex = source.indexOf("<DropdownMenuSeparator />", usageIndex);

    expect(localeIndex).toBeGreaterThan(-1);
    expect(themeIndex).toBeGreaterThan(localeIndex);
    expect(zoomIndex).toBeGreaterThan(themeIndex);
    expect(usageIndex).toBeGreaterThan(zoomIndex);
    expect(separatorBeforeAuthIndex).toBeGreaterThan(usageIndex);
    expect(loginIndex).toBeGreaterThan(separatorBeforeAuthIndex);
    expect(logoutIndex).toBeGreaterThan(separatorBeforeAuthIndex);
  });

  it("keeps settings-page usage stats separate from the back button", () => {
    const footerSource = readFileSync(
      resolve(process.cwd(), "packages/ui/src/WorkspaceSidebarFooter.tsx"),
      "utf8",
    );
    const settingsSource = readFileSync(
      resolve(process.cwd(), "packages/ui/src/SettingsPage.tsx"),
      "utf8",
    );

    expect(footerSource).toContain("onUsageClick,");
    expect(footerSource).toContain(
      "const usageButtonClick = onUsageClick ?? onSettingsButtonClick;",
    );
    expect(footerSource).toContain("usageButtonClick?.();");
    expect(settingsSource).toContain("const handleOpenUsageSettings = useCallback(() => {");
    expect(settingsSource).toContain('setActiveSettingsSection("usage");');
    expect(settingsSource).toContain("onSettingsButtonClick={onBack}");
    expect(settingsSource).toContain("onUsageClick={handleOpenUsageSettings}");
  });

  it("keeps duplicated help actions out of the profile menu", () => {
    const source = readFileSync(
      resolve(process.cwd(), "packages/ui/src/WorkspaceSidebarFooter.tsx"),
      "utf8",
    );

    expect(source).not.toContain('id: "titleBar.menu.help.feedback"');
    expect(source).not.toContain('id: "sidebar.menu.community"');
    expect(source).not.toContain('id: "titleBar.menu.help.exportLogs"');
    expect(source).not.toContain("<DropdownMenuItem onSelect={onSettingsButtonClick}>");
    expect(source).not.toContain("runExportLogsAction");
  });
});

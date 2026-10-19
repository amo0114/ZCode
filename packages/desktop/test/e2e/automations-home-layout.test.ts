import { tmpdir } from "node:os";
import { join } from "node:path";
import { TID_AUTOMATION_CREATE_MANUALLY, TID_AUTOMATIONS_OPEN } from "@zcode/shared";
import {
  clearAppData,
  clickTestIdByDom,
  restoreElectronRendererContentSize,
  setCurrentElectronRendererContentSize,
  type ElectronRendererContentSizeSnapshot,
  waitForTestIdByDom,
} from "./helpers/desktop-app.js";
import { prepareConversationE2E } from "./helpers/conversation-session.js";

/**
 * Figma 4798:2443 空首页布局回归。
 *
 * 修复原因：旧首页把 keep-awake 提示条放在空状态之前，并把模板拉成三列；
 * 宽屏截图因此同时出现顺序、宽度和卡片密度偏差。这里验证真实 renderer 的
 * 几何关系，避免只靠 Tailwind class 静态阅读误判。
 *
 * Off-Peak（闲时）已移除：首页只剩定时任务一组模板，Idle-time 卡片与入口不再渲染。
 */
describe("Automations 空首页 Figma 布局 E2E", () => {
  let rendererSizeSnapshot: ElectronRendererContentSizeSnapshot | undefined;

  after(async () => {
    if (rendererSizeSnapshot) {
      await restoreElectronRendererContentSize(rendererSizeSnapshot);
    }
    await browser.electron.restoreAllMocks();
    await clearAppData();
  });

  it("按空状态、保持唤醒、定时模板的顺序渲染", async function () {
    this.timeout(150000);

    await prepareConversationE2E({ skipProvider: true });
    // 修复原因：Electron 41 不实现 WebDriver window/rect 依赖的
    // Browser.getWindowForTarget，必须通过 BrowserWindow 调整 renderer viewport。
    // macOS work area 可能小于 960px；本用例只需要宽屏双列断点，不能把不可达高度
    // 当作产品布局契约。
    rendererSizeSnapshot = await setCurrentElectronRendererContentSize(1440);
    await clickTestIdByDom(TID_AUTOMATIONS_OPEN, {
      timeoutMsg: "侧栏没有出现 Automations 入口",
    });
    await waitForTestIdByDom(TID_AUTOMATION_CREATE_MANUALLY, {
      timeoutMsg: "定时任务创建按钮没有出现",
    });
    await browser.waitUntil(
      async () =>
        browser.execute(() =>
          [
            "[data-automations-content]",
            "[data-automations-empty-state]",
            "[data-automations-keep-awake]",
            "[data-automations-scheduled-templates]",
          ].every((selector) => document.querySelector(selector)?.getBoundingClientRect().width),
        ),
      {
        timeout: 10000,
        timeoutMsg: "Automations 空首页组件没有完整渲染",
      },
    );
    // Bug 原因：模板 section 在 skeleton 阶段已经有宽度；旧 E2E 立即读取 grid，
    // 把 4 个骨架卡和无障碍文案节点误当成 5 张真实模板卡。
    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const section = document.querySelector<HTMLElement>(
            "[data-automations-scheduled-templates]",
          );
          return (
            section?.getAttribute("aria-busy") === "false" &&
            !section.querySelector("[data-automation-template-skeleton-card]")
          );
        }),
      {
        timeout: 30000,
        timeoutMsg: "Automations 模板仍处于 skeleton 加载态",
      },
    );

    const layout = await browser.execute((manualCreateTestId) => {
      const requireElement = (selector: string): HTMLElement => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) throw new Error(`Missing element: ${selector}`);
        return element;
      };
      const rect = (element: HTMLElement) => {
        const value = element.getBoundingClientRect();
        return {
          top: value.top,
          right: value.right,
          bottom: value.bottom,
          left: value.left,
          width: value.width,
          height: value.height,
        };
      };
      const gridMetrics = (section: HTMLElement) => {
        const grid = section.querySelector<HTMLElement>(".grid");
        if (!grid) throw new Error("Missing template grid");
        return {
          columns: getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length,
          cards: grid.children.length,
          firstCardRadius:
            grid.querySelector("button") instanceof HTMLElement
              ? getComputedStyle(grid.querySelector("button") as HTMLElement).borderRadius
              : "",
        };
      };

      const content = requireElement("[data-automations-content]");
      const empty = requireElement("[data-automations-empty-state]");
      const keepAwake = requireElement("[data-automations-keep-awake]");
      const scheduled = requireElement("[data-automations-scheduled-templates]");
      const manualCreate = requireElement(`[data-testid="${manualCreateTestId}"]`);
      const contentStyle = getComputedStyle(content);

      return {
        contentWidth:
          content.getBoundingClientRect().width -
          Number.parseFloat(contentStyle.paddingLeft) -
          Number.parseFloat(contentStyle.paddingRight),
        empty: rect(empty),
        keepAwake: rect(keepAwake),
        scheduled: rect(scheduled),
        manualCreate: rect(manualCreate),
        emptyRadius: getComputedStyle(empty).borderRadius,
        keepAwakeRadius: getComputedStyle(keepAwake).borderRadius,
        scheduledGrid: gridMetrics(scheduled),
        hasIdleTemplates: document.querySelector("[data-automations-idle-templates]") !== null,
      };
    }, TID_AUTOMATION_CREATE_MANUALLY);

    // Settings 统一内容框当前为 max-w-4xl（896px）+ 左右 32px padding，内列应为 832px；
    // 旧 802px 是收敛 Settings 框架前的历史值，不能继续当作当前布局的回归基线。
    assertNear(layout.contentWidth, 832, 1, "桌面内容列宽度");
    assertNear(layout.empty.height, 226, 1, "空状态卡高度");
    assertNear(layout.keepAwake.height, 44, 1, "Keep-awake 提示条高度");
    assertNear(layout.keepAwake.top - layout.empty.bottom, 16, 1, "空状态与提示条间距");
    if (!(layout.empty.top < layout.keepAwake.top && layout.keepAwake.top < layout.scheduled.top)) {
      throw new Error("主页顺序不是空状态 → Keep-awake → Scheduled template");
    }
    // 闲时模板区已随 Off-Peak 移除：不得再渲染该容器。
    if (layout.hasIdleTemplates) {
      throw new Error("闲时模板区已移除，不应继续渲染 [data-automations-idle-templates]");
    }
    // 修复原因：Keep-awake 提示条已按当前设计契约统一为 10px，旧 E2E 仍断言 8px，
    // 导致实际布局与 UI 单元契约一致时反而误报失败。
    if (layout.emptyRadius !== "16px" || layout.keepAwakeRadius !== "10px") {
      throw new Error(
        `圆角不符合设计映射：empty=${layout.emptyRadius}, keepAwake=${layout.keepAwakeRadius}`,
      );
    }
    assertTemplateGrid(layout.scheduledGrid, "Scheduled task template", 4);

    if (process.env.ZCODE_E2E_VISUAL_CAPTURE === "1") {
      await browser.saveScreenshot(join(tmpdir(), "zcode-automations-home-4798-2443.png"));
    }
  });
});

function assertNear(actual: number, expected: number, tolerance: number, label: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}应为 ${expected}px，实际为 ${actual}px`);
  }
}

function assertTemplateGrid(
  grid: { columns: number; cards: number; firstCardRadius: string },
  label: string,
  expectedCards: number,
): void {
  if (grid.columns !== 2 || grid.cards !== expectedCards || grid.firstCardRadius !== "12px") {
    throw new Error(
      `${label} 应为双列 ${expectedCards} 卡且卡片圆角 12px，实际 columns=${grid.columns}, cards=${grid.cards}, radius=${grid.firstCardRadius}`,
    );
  }
}

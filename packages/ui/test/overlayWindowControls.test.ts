import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

it("登录页原生拖拽层避开窗控，并先于 no-drag 按钮声明", async () => {
  const source = await readFile(resolve(__dirname, "../src/WelcomeScreen.tsx"), "utf8");
  const drag = source.indexOf("[app-region:drag]");
  expect(drag).toBeGreaterThan(-1);
  expect(drag).toBeLessThan(source.indexOf("<DesktopOverlayWindowControls />"));
  expect(source).toContain("platform-windows-desktop:right-[134px]");
  expect(source).toContain("platform-linux-desktop:right-[134px]");
});

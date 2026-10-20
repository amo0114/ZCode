import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("未启用自动更新的构建跳过远端强制升级检查", () => {
  const source = readFileSync(resolve(process.cwd(), "packages/desktop/src/main/index.ts"), "utf8");
  const start = source.indexOf("const forceUpdateGuardResult =");
  const gate = source.slice(
    start,
    source.indexOf("? await maybeBlockStartupForForceUpdate", start),
  );
  expect(start).toBeGreaterThanOrEqual(0);
  expect(gate).toContain('ZCODE_PRODUCT_FLAVOR === "production"');
  expect(gate).toContain("ZCODE_AUTO_UPDATE_ENABLED");
  expect(gate).toContain("!skipForceUpdateForLocalDevRuntime");
});

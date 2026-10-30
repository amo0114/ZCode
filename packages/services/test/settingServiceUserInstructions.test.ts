import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { USER_INSTRUCTIONS_MAX_BYTES, USER_INSTRUCTIONS_TOO_LARGE_ERROR_CODE } from "@zcode/shared";

const originalHome = process.env.HOME;
const tempHomes: string[] = [];

async function createServiceInTempHome() {
  const home = mkdtempSync(join(tmpdir(), "zcode-user-instructions-"));
  tempHomes.push(home);
  process.env.HOME = home;
  vi.resetModules();
  const mod = await import("../src/setting/settingService.js");
  return { home, service: mod.createSettingService() };
}

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  for (const home of tempHomes.splice(0)) rmSync(home, { recursive: true, force: true });
});

describe("settingService user instructions", () => {
  it("文件缺失时返回空内容，路径与 CLI 读取的 ~/.zcode/AGENTS.md 一致", async () => {
    const { home, service } = await createServiceInTempHome();
    await expect(service.getUserInstructions()).resolves.toEqual({
      content: "",
      filePath: join(home, ".zcode", "AGENTS.md"),
    });
  });

  it("首次保存会创建 ~/.zcode 并以 0600 写入，按保存顺序读到最新内容", async () => {
    const { home, service } = await createServiceInTempHome();
    const filePath = join(home, ".zcode", "AGENTS.md");
    await Promise.all([
      service.saveUserInstructions("first"),
      service.saveUserInstructions("second"),
    ]);
    expect(readFileSync(filePath, "utf8")).toBe("second");
    if (process.platform !== "win32") expect(statSync(filePath).mode & 0o777).toBe(0o600);
    await expect(service.getUserInstructions()).resolves.toMatchObject({ content: "second" });
  });

  it("超过 CLI 读取上限的内容直接拒绝", async () => {
    const { service } = await createServiceInTempHome();
    await expect(
      service.saveUserInstructions("x".repeat(USER_INSTRUCTIONS_MAX_BYTES + 1)),
    ).rejects.toMatchObject({ code: USER_INSTRUCTIONS_TOO_LARGE_ERROR_CODE });
  });
});

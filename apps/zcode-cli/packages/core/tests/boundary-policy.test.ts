import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 安全边界按模型分流。核心断言是「同一份代码，不同模型不同条款」——
 * 这是整个功能的价值所在，其他细节都围绕它。
 *
 * 配置路径固定在 `~/.zcode/cli/security-boundary.json`，
 * 测试通过 mock `node:os` 的 homedir 把它重定向到临时目录，
 * 避免碰用户的真实配置。
 */

let fakeHome: string;

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => fakeHome };
});

async function loadPolicy() {
  // 每次 import 前重置模块缓存，确保读到新的配置文件
  vi.resetModules();
  return await import("../src/context/boundary-policy.js");
}

function writeBoundaryConfig(config: unknown) {
  const dir = join(fakeHome, ".zcode", "cli");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "security-boundary.json"), JSON.stringify(config, null, 2), "utf8");
}

describe("boundary-policy", () => {
  beforeEach(() => {
    fakeHome = mkdtempSync(join(tmpdir(), "zcode-boundary-"));
  });

  afterEach(() => {
    rmSync(fakeHome, { recursive: true, force: true });
  });

  it("无配置文件时一律返回官方条款", async () => {
    const { resolveBoundary, OFFICIAL_NOTICE } = await loadPolicy();
    const decision = resolveBoundary({ providerId: "deepseek", modelId: "deepseek-v4.1-flash" });
    expect(decision.kind).toBe("official");
    expect(decision.notice).toBe(OFFICIAL_NOTICE);
    expect(decision.reason).toBe("default");
  });

  it("命中 unrestricted 时返回放宽条款", async () => {
    writeBoundaryConfig({ unrestricted: ["deepseek"] });
    const { resolveBoundary, BUILTIN_UNRESTRICTED_NOTICE } = await loadPolicy();
    const decision = resolveBoundary({ providerId: "new-provider", modelId: "deepseek-v4.1-flash" });
    expect(decision.kind).toBe("unrestricted");
    expect(decision.notice).toBe(BUILTIN_UNRESTRICTED_NOTICE);
    expect(decision.reason).toBe("unrestricted:deepseek");
  });

  it("未命中的模型保持官方条款（同一份代码两种行为）", async () => {
    writeBoundaryConfig({ unrestricted: ["deepseek"] });
    const { resolveBoundary, OFFICIAL_NOTICE } = await loadPolicy();

    const unrestricted = resolveBoundary({ providerId: "any", modelId: "deepseek-v4.1-flash" });
    const official = resolveBoundary({ providerId: "any", modelId: "claude-3-opus" });

    expect(unrestricted.kind).toBe("unrestricted");
    expect(official.kind).toBe("official");
    expect(official.notice).toBe(OFFICIAL_NOTICE);
  });

  it("strict 压过 unrestricted", async () => {
    writeBoundaryConfig({ unrestricted: ["deepseek"], strict: ["deepseek"] });
    const { resolveBoundary, OFFICIAL_NOTICE } = await loadPolicy();
    const decision = resolveBoundary({ modelId: "deepseek-v4.1-flash" });
    expect(decision.kind).toBe("official");
    expect(decision.notice).toBe(OFFICIAL_NOTICE);
    expect(decision.reason).toBe("strict:deepseek");
  });

  it("匹配 providerId 与 modelId，且不区分大小写", async () => {
    writeBoundaryConfig({ unrestricted: ["DeepSeek"] });
    const { resolveBoundary } = await loadPolicy();
    expect(resolveBoundary({ modelId: "deepseek-v4.1-flash" }).kind).toBe("unrestricted");
    expect(resolveBoundary({ providerId: "MyDeepSeekRelay", modelId: "x" }).kind).toBe("unrestricted");
  });

  it("noticeFile 存在时覆盖内置文案", async () => {
    const custom = "CUSTOM BOUNDARY TEXT";
    const customPath = join(fakeHome, "custom-notice.md");
    writeFileSync(customPath, custom, "utf8");
    writeBoundaryConfig({ unrestricted: ["deepseek"], noticeFile: customPath });

    const { resolveBoundary } = await loadPolicy();
    expect(resolveBoundary({ modelId: "deepseek-v4.1-flash" }).notice).toBe(custom);
  });

  it("noticeFile 缺失时退回内置文案", async () => {
    writeBoundaryConfig({ unrestricted: ["deepseek"], noticeFile: join(fakeHome, "missing.md") });
    const { resolveBoundary, BUILTIN_UNRESTRICTED_NOTICE } = await loadPolicy();
    expect(resolveBoundary({ modelId: "deepseek-v4.1-flash" }).notice).toBe(
      BUILTIN_UNRESTRICTED_NOTICE,
    );
  });

  it("配置损坏时退回官方条款而不是放宽", async () => {
    const dir = join(fakeHome, ".zcode", "cli");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "security-boundary.json"), "{ this is not json", "utf8");

    const { resolveBoundary, OFFICIAL_NOTICE } = await loadPolicy();
    const decision = resolveBoundary({ modelId: "deepseek-v4.1-flash" });
    expect(decision.kind).toBe("official");
    expect(decision.notice).toBe(OFFICIAL_NOTICE);
  });

  it("不传 model 时返回官方条款", async () => {
    writeBoundaryConfig({ unrestricted: ["deepseek"] });
    const { resolveBoundary, OFFICIAL_NOTICE } = await loadPolicy();
    expect(resolveBoundary().notice).toBe(OFFICIAL_NOTICE);
  });

  it("空关键词不匹配任何模型", async () => {
    writeBoundaryConfig({ unrestricted: ["", "  "] });
    const { resolveBoundary, OFFICIAL_NOTICE } = await loadPolicy();
    expect(resolveBoundary({ modelId: "deepseek-v4.1-flash" }).notice).toBe(OFFICIAL_NOTICE);
  });
});

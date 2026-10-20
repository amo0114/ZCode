import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 端到端验证：配置驱动 → ContextBuilder → system prompt 里的安全边界文案。
 *
 * boundary-policy 的单元测试只证明「判定正确」，这里证明「判定结果真的
 * 进了 system prompt」。两者都过才算功能可用——只有单元测试时，
 * 接线错了也看不出来。
 */

let fakeHome: string;

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => fakeHome };
});

function writeBoundaryConfig(config: unknown) {
  const dir = join(fakeHome, ".zcode", "cli");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "security-boundary.json"), JSON.stringify(config), "utf8");
}

const envInfo = {
  platform: "linux",
  shell: "bash",
  osVersion: "test",
  nodeVersion: "v24.14.0",
} as const;

async function loadBuilder() {
  vi.resetModules();
  const [{ createContextBuilder }, policy] = await Promise.all([
    import("../src/context/builder.js"),
    import("../src/context/boundary-policy.js"),
  ]);
  return { createContextBuilder, ...policy };
}

function systemText(
  createContextBuilder: typeof import("../src/context/builder.js").createContextBuilder,
  model?: { providerId: string; modelId: string },
): string {
  const config = {
    workingDirectory: "/workspace",
    envInfo,
    ...(model === undefined ? {} : { model }),
  } as Parameters<typeof createContextBuilder>[0];
  return createContextBuilder(config)
    .build()
    .systemMessages.map((message) => String(message.content))
    .join("\n");
}

describe("boundary policy 接线到 system prompt", () => {
  beforeEach(() => {
    fakeHome = mkdtempSync(join(tmpdir(), "zcode-boundary-wire-"));
  });

  afterEach(() => {
    rmSync(fakeHome, { recursive: true, force: true });
  });

  it("unrestricted 里的模型拿到放宽条款", async () => {
    writeBoundaryConfig({ unrestricted: ["deepseek"] });
    const { createContextBuilder, BUILTIN_UNRESTRICTED_NOTICE, OFFICIAL_NOTICE } = await loadBuilder();

    const text = systemText(createContextBuilder, {
      providerId: "new-provider",
      modelId: "deepseek-v4.1-flash",
    });

    expect(text).toContain(BUILTIN_UNRESTRICTED_NOTICE);
    expect(text).not.toContain(OFFICIAL_NOTICE);
  });

  it("未命中的模型保持官方条款", async () => {
    writeBoundaryConfig({ unrestricted: ["deepseek"] });
    const { createContextBuilder, BUILTIN_UNRESTRICTED_NOTICE, OFFICIAL_NOTICE } = await loadBuilder();

    const text = systemText(createContextBuilder, { providerId: "anthropic", modelId: "claude-3-opus" });

    expect(text).toContain(OFFICIAL_NOTICE);
    expect(text).not.toContain(BUILTIN_UNRESTRICTED_NOTICE);
  });

  it("同一份配置下两个模型得到不同条款", async () => {
    writeBoundaryConfig({ unrestricted: ["deepseek"], strict: ["claude"] });
    const { createContextBuilder, BUILTIN_UNRESTRICTED_NOTICE, OFFICIAL_NOTICE } = await loadBuilder();

    const deepseekText = systemText(createContextBuilder, { providerId: "p", modelId: "deepseek-v4" });
    const claudeText = systemText(createContextBuilder, { providerId: "p", modelId: "claude-3-opus" });

    expect(deepseekText).toContain(BUILTIN_UNRESTRICTED_NOTICE);
    expect(claudeText).toContain(OFFICIAL_NOTICE);
  });

  it("不传 model 时行为与改前一致（官方条款）", async () => {
    writeBoundaryConfig({ unrestricted: ["deepseek"] });
    const { createContextBuilder, OFFICIAL_NOTICE } = await loadBuilder();

    expect(systemText(createContextBuilder)).toContain(OFFICIAL_NOTICE);
  });

  it("工作流子代理也按模型走", async () => {
    writeBoundaryConfig({ unrestricted: ["deepseek"] });
    const { createContextBuilder, BUILTIN_UNRESTRICTED_NOTICE } = await loadBuilder();

    const config = {
      workingDirectory: "/workspace",
      envInfo,
      model: { providerId: "p", modelId: "deepseek-v4" },
      workflowActor: { name: "reviewer", persona: "You are a strict reviewer." },
    } as Parameters<typeof createContextBuilder>[0];

    const text = createContextBuilder(config)
      .build()
      .systemMessages.map((message) => String(message.content))
      .join("\n");

    expect(text).toContain(BUILTIN_UNRESTRICTED_NOTICE);
  });
});

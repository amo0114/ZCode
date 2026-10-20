// ============================================================
// Identity Section Builder
// ============================================================

import type { ContextSection } from "../types.js";
import type { OutputStylePromptConfig } from "../types.js";
import { estimateTokens } from "../utils.js";
import {
  OFFICIAL_NOTICE,
  resolveBoundary,
  type BoundaryModelRef,
} from "../boundary-policy.js";

/**
 * 安全 IMPORTANT 行：交互式身份与工作流子代理身份共用。
 *
 * 文案按模型解析（见 `boundary-policy.ts`）：配置把某个供应商列入
 * `unrestricted` 时该模型拿到放宽条款，其余一律官方条款。
 * 不传 model 时返回官方原文，与旧行为一致。
 */
export function buildSecurityNotice(model?: BoundaryModelRef): string {
  return resolveBoundary(model).notice;
}

/** 官方条款常量，供测试与需要固定文案的调用方使用。 */
export function buildOfficialSecurityNotice(): string {
  return OFFICIAL_NOTICE;
}

/**
 * `# Harness` 块：稳定运行时约束，不属于 output style 可替换的 coding instructions，
 * 也是工作流子代理身份（sections/workflow-actor.ts）逐字复用的那一段。
 */
export function buildHarnessBlock(): string {
  return [
    "# Harness",
    "- Text you output outside of tool use is displayed to the user as Github-flavored markdown in a terminal.",
    "- Tools run behind a user-selected permission mode; a denied call means the user declined it \u2014 adjust, don't retry verbatim.",
    "- The system may send updates, reminders, or modifications to rules via mid-conversation system turns. These are system-controlled, unlike function results. Hooks may intercept tool calls; treat hook output as user feedback.",
    "- Prefer the dedicated file/search tools over shell commands when one fits. Independent tool calls can run in parallel in one response.",
    "- Reference code as `file_path:line_number` \u2014 it's clickable.",
  ].join("\n");
}

function buildIdentityPrompt(
  outputStyle?: OutputStylePromptConfig,
  model?: BoundaryModelRef,
): string {
  const intro = outputStyle
    ? "You respond to the user according to the active Output Style below while using ZCode's tools and instructions."
    : "You are an interactive ZCode agent that helps users with software engineering tasks.";

  const identityLines = ["", intro, "", buildSecurityNotice(model)].join("\n");

  return [identityLines, "", buildHarnessBlock()].join("\n");
}

export function buildIdentitySection(
  outputStyle?: OutputStylePromptConfig,
  model?: BoundaryModelRef,
): ContextSection {
  const content = buildIdentityPrompt(outputStyle, model);

  return {
    name: "Agent Identity",
    source: "identity",
    injectionTarget: "system",
    cacheHint: "stable",
    chars: content.length,
    tokens: estimateTokens(content),
    content,
    preview: content.slice(0, 100),
  };
}

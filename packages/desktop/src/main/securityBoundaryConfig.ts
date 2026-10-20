/**
 * 安全边界配置的宿主侧读写。
 *
 * 文件位置与 agent 侧 `boundary-policy.ts` 完全一致：
 * `~/.zcode/cli/security-boundary.json`。agent 在每次组装 system prompt 时读取它，
 * 因此这里写入后重启 ZCode 即生效。
 *
 * 容错策略与 agent 侧对齐：
 * - 读取失败或 JSON 损坏 → 返回空配置（即全部使用官方条款），不抛错
 * - 写入前先读现有文件，保留未知字段（用户可能手工加了 noticeFile）
 * - 写入采用「临时文件 + rename」原子替换，避免半截文件让 agent 读到损坏配置
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface SecurityBoundaryConfig {
  readonly unrestricted: readonly string[];
  readonly strict: readonly string[];
}

const EMPTY: SecurityBoundaryConfig = { unrestricted: [], strict: [] };

export function securityBoundaryPath(): string {
  return join(homedir(), ".zcode", "cli", "security-boundary.json");
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function readSecurityBoundary(): SecurityBoundaryConfig {
  const path = securityBoundaryPath();
  if (!existsSync(path)) return EMPTY;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, "")) as Record<
      string,
      unknown
    >;
    if (raw === null || typeof raw !== "object") return EMPTY;
    return {
      unrestricted: readStringArray(raw.unrestricted),
      strict: readStringArray(raw.strict),
    };
  } catch {
    // 损坏时按「未配置」处理：宁可回到官方条款，也不要放宽。
    return EMPTY;
  }
}

/**
 * 写入配置。保留文件里本模块不认识的字段（例如 `noticeFile`），
 * 这样设置页不会把用户手工配置的自定义文案路径抹掉。
 */
export function writeSecurityBoundary(config: SecurityBoundaryConfig): void {
  const path = securityBoundaryPath();
  mkdirSync(dirname(path), { recursive: true });

  let existing: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, "")) as unknown;
      if (parsed !== null && typeof parsed === "object") existing = parsed as Record<string, unknown>;
    } catch {
      // 原文件损坏：直接覆盖，反正 agent 也读不出有效配置。
      existing = {};
    }
  }

  const next = {
    ...existing,
    unrestricted: readStringArray(config.unrestricted),
    strict: readStringArray(config.strict),
  };

  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

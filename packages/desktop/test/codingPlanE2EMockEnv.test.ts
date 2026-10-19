import { describe, expect, it } from "vitest";

import { shouldPrepareCodingPlanTeamMock } from "./e2e/helpers/coding-plan-mock-env.js";

describe("Coding Plan E2E mock env", () => {
  it("定时任务创建遥测回归隔离账号控制面", () => {
    expect(shouldPrepareCodingPlanTeamMock([
      "./test/e2e/conversation-session/conversation-session-automation-run-title-stable.test.ts",
    ])).toBe(true);
  });
  it.each(["conversation-session-create-telemetry.test.ts"])(
    "prepares account facts for %s",
    (spec) => {
      expect(
        shouldPrepareCodingPlanTeamMock([
          `./test/e2e/conversation-session/manual-review/pending/${spec}`,
        ]),
      ).toBe(true);
    },
  );
  it("prepares the team mock when the default full-suite glob can select team specs", () => {
    expect(shouldPrepareCodingPlanTeamMock(["./test/e2e/**/*.test.ts"])).toBe(true);
    expect(
      shouldPrepareCodingPlanTeamMock([
        "./test/e2e/conversation-session/conversation-session-background.test.ts",
      ]),
    ).toBe(false);
  });
});

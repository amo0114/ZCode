import { expect, it } from "vitest";
import { shouldPrepareCodingPlanTeamMock } from "./e2e/helpers/coding-plan-mock-env.js";

it("连续切模回放隔离启动账号控制面，避免假 JWT 请求线上后遮挡模型菜单", () => {
  expect(
    shouldPrepareCodingPlanTeamMock([
      "./test/e2e/conversation-session/manual-review/pending/conversation-session-active-model-context.test.ts",
    ]),
  ).toBe(true);
});

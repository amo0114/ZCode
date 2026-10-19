import { describe, expect, it } from "vitest";
import { zcodeSessionSendParamsSchema } from "@zcode/shared";
import { createModelExecutionContext } from "../src/zcode-protocol/model-execution.js";

describe("执行上下文投影", () => {
  it("原样透传 selectionFallback 声明，包括发起方声明的退回目标", () => {
    // 退回目标必须完整到达 core：冷恢复竞态下 runtime 可能没有常驻选择，这是唯一的退回依据。
    const selectionFallback = {
      providerId: "account:bigmodel-team-coding-plan",
      rules: [
        { reason: "highspeed_card_expired" as const, providerErrorCode: "3402" },
        { reason: "highspeed_request_failed" as const },
      ],
      target: {
        providerId: "account:bigmodel-team-coding-plan",
        modelId: "GLM-5.3",
        options: { reasoningLevel: "low" },
      },
    };
    const execution = createModelExecutionContext(
      zcodeSessionSendParamsSchema.shape.modelExecution
        .unwrap()
        .parse({ selectionScope: "execution", selectionFallback }),
    );
    expect(execution.selectionFallback).toEqual(selectionFallback);
  });
});

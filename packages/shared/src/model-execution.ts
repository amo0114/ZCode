import { z } from "zod";
import { modelSelectionSchema } from "./model-selection.js";

/**
 * 执行 Selection 退回 Session Selection 的原因。由发起方在 selectionFallback 规则里声明，
 * CLI 只透传命中规则的原因，不自行解释 provider 错误码。
 */
/**
 * 执行 Selection 退回原因。与 @zcode/contracts 的 TurnExecutionModelFallbackReason 保持同值域。
 *
 * 注意：这两个值虽源自 Highspeed 加速卡（该功能已于 2026-10 移除），但**必须保留**——
 * 历史会话的 `TurnExecutionModelFallback` 事件已按此值域持久化在 transcript 中，
 * 收窄枚举会让旧事件在 hydrate 时校验失败。新代码不再产生这两个值。
 */
const modelExecutionSelectionFallbackReasonSchema = z.enum([
  "highspeed_card_expired",
  "highspeed_request_failed",
]);

/** 文本与附件发送共用执行约束，只属于单次执行，不进入 Session 配置。 */
export const modelExecutionSchema = z
  .object({
    memoryExtraction: z.literal("skip").optional(),
    selectionScope: z.literal("execution"),
    subagents: z
      .object({
        foregroundModel: z.literal("submission"),
        background: z.literal("deny"),
      })
      .strict()
      .optional(),
    /**
     * 本次执行的 Selection 失败时，同一 Turn 内退回原模型继续跑完，而不是让整轮失败。
     * 触发条件由发起方声明：`providerId` 限定只匹配本轮 execution Selection 指向的 provider；
     * `rules` 按声明顺序匹配，首个命中的规则决定退回原因，`providerErrorCode` 缺省表示该 provider
     * 的任何失败（用户取消与上下文超窗除外）。CLI 不按 provider id 前缀、模型名或错误文案硬编码。
     * 退回目标先取 `target`（发起方抽卡时的提交选择，即会话原模型），再取 runtime 会话常驻 Selection：
     * execution 作用域从不改写会话选择，但常驻选择只在 runtime 内存里，冷恢复竞态下可能未绑定，
     * 所以发起方必须声明 `target`（抽卡时的提交选择）。
     */
    selectionFallback: z
      .object({
        providerId: z.string().min(1),
        rules: z
          .array(
            z
              .object({
                reason: modelExecutionSelectionFallbackReasonSchema,
                providerErrorCode: z.string().min(1).optional(),
              })
              .strict(),
          )
          .min(1),
        target: modelSelectionSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

type ModelExecution = z.infer<typeof modelExecutionSchema>;
type ModelExecutionSelectionFallback = NonNullable<ModelExecution["selectionFallback"]>;
export type ModelExecutionSelectionFallbackRule = ModelExecutionSelectionFallback["rules"][number];
export type ModelExecutionSelectionFallbackReason = z.infer<
  typeof modelExecutionSelectionFallbackReasonSchema
>;

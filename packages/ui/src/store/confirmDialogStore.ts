import { create } from "zustand";
import { logger } from "@/logger.js";

export interface ConfirmDialogRequest {
  title: string;
  testId?: string;
  description?: string;
  /** 特定业务弹框的稳定视觉规范；默认确认框不受影响。 */
  presentation?: "automation-confirmation" | "yolo-confirmation";
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "default" | "destructive";
  showCloseButton?: boolean;
  showKeyboardHints?: boolean;
  compact?: boolean;
  checkbox?: { label: string; onCheckedChange: (checked: boolean) => void };
}

export type ConfirmDialogChoice = "confirm" | "cancel" | "dismiss";

interface PendingConfirmDialogRequest extends ConfirmDialogRequest {
  resolve: (choice: ConfirmDialogChoice) => void;
}

interface ConfirmDialogState {
  pendingRequest?: PendingConfirmDialogRequest;
  requestConfirmation: (payload: ConfirmDialogRequest, signal?: AbortSignal) => Promise<boolean>;
  requestChoice: (
    payload: ConfirmDialogRequest,
    signal?: AbortSignal,
  ) => Promise<ConfirmDialogChoice>;
  settleConfirmation: (confirmed: boolean) => void;
  settleChoice: (choice: ConfirmDialogChoice) => void;
}

export const useConfirmDialogStore = create<ConfirmDialogState>((set, get) => ({
  pendingRequest: undefined,
  requestConfirmation: async (payload, signal) =>
    (await get().requestChoice(payload, signal)) === "confirm",
  requestChoice: (payload, signal) => {
    if (signal?.aborted) return Promise.resolve("dismiss");
    if (get().pendingRequest) {
      logger.warn("[ConfirmDialogStore] confirmation already in progress");
      return Promise.resolve("dismiss");
    }

    return new Promise<ConfirmDialogChoice>((resolve) => {
      const pendingRequest: PendingConfirmDialogRequest = {
        ...payload,
        resolve: (choice) => {
          signal?.removeEventListener("abort", abort);
          resolve(choice);
        },
      };
      // 目标失效只能关闭自己的请求，不能结算后来打开的其他确认框。
      const abort = () => {
        if (get().pendingRequest === pendingRequest) get().settleChoice("dismiss");
      };
      signal?.addEventListener("abort", abort, { once: true });
      set({ pendingRequest });
    });
  },
  settleConfirmation: (confirmed) => get().settleChoice(confirmed ? "confirm" : "cancel"),
  settleChoice: (choice) => {
    const pendingRequest = get().pendingRequest;
    if (!pendingRequest) {
      return;
    }

    set({ pendingRequest: undefined });
    pendingRequest.resolve(choice);
  },
}));

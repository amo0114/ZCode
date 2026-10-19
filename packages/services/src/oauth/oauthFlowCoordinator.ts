import { randomBytes } from "node:crypto";
import type { OAuthProviderId } from "@zcode/shared";

/** OAuth 超时时间（5 分钟） */
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

interface PendingOAuthFlow {
  readonly state: string;
  readonly provider: OAuthProviderId;
}

interface PendingOAuthFlowEntry extends PendingOAuthFlow {
  readonly timeout: NodeJS.Timeout;
}

/**
 * Redirect 登录流程的 pending 状态：同一时刻只有一个 flow，state 由这里生成并在回调时校验。
 * 不写凭据；落盘由 OAuthSessionStore 负责。
 */
export class OAuthFlowCoordinator {
  private pending: PendingOAuthFlowEntry | null = null;

  constructor(private readonly timeoutMs = OAUTH_TIMEOUT_MS) {}

  /** 开始新 flow 并让旧 flow 失效：两条流程共享同一回调通道，旧 state 不能继续被接受。 */
  begin(provider: OAuthProviderId): PendingOAuthFlow {
    this.clear();
    const state = randomBytes(32).toString("hex");
    const timeout = setTimeout(() => {
      if (this.pending?.state === state) {
        this.pending = null;
      }
    }, this.timeoutMs);
    const flow = { state, provider, timeout };
    this.pending = flow;
    return flow;
  }

  /** 回调 state 必须与当前 pending flow 一致，否则视为过期或伪造回调。 */
  matchCallback(url: string): PendingOAuthFlow {
    const state = new URL(url).searchParams.get("state");
    const pending = this.pending;
    if (!pending || !state || state !== pending.state) {
      throw new Error("OAuth state 不匹配或已过期");
    }
    return pending;
  }

  /** exchangeToken 期间用户可能取消或开始新 flow；落盘前后都要用它复核。 */
  isCurrent(flow: PendingOAuthFlow): boolean {
    return this.pending === flow;
  }

  finish(flow: PendingOAuthFlow): void {
    if (this.isCurrent(flow)) {
      this.clear();
    }
  }

  cancel(provider?: OAuthProviderId): void {
    if (provider && this.pending?.provider !== provider) {
      return;
    }
    this.clear();
  }

  clear(): void {
    if (!this.pending) {
      return;
    }
    clearTimeout(this.pending.timeout);
    this.pending = null;
  }
}

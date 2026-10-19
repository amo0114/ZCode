import { useEffect, useState } from "react";
import type { IPlatformService, OAuthCallbackResult, UserInfo } from "@zcode/shared";
import type { IServiceAccessor } from "@zcode/services";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { reportAppTelemetryEvent } from "@/lib/appTelemetry.js";
import { logger } from "@/logger.js";

export async function handleOAuthCallbackSuccess(params: {
  result: OAuthCallbackResult;
  platform: Pick<IPlatformService, "reportTelemetryEvent">;
  refreshProviderState: () => Promise<void>;
  setUser: (user: UserInfo | null) => void;
  setOAuthError: (error: string | null) => void;
}) {
  params.setUser(params.result.userInfo);
  params.setOAuthError(null);
  await params.refreshProviderState();
  void reportAppTelemetryEvent(
    params.platform,
    {
      elementName: "app_login_success",
      eventRegion: "app_profile",
      eventType: "view",
      eventExtraDetail: {
        login_provider: params.result.provider,
      },
    },
    "Root",
  );
  logger.info("[Root] OAuth 登录成功:", params.result.userInfo.username);
}

/**
 * Root 常驻的 OAuth 生命周期：启动恢复本地会话、处理 deep link 回调。
 * 返回是否存在已注册的登录渠道；没有渠道时调用方不渲染任何登录入口（I7）。
 */
export function useRootOAuthEffects({
  platform,
  services,
  refreshProviderState,
  setUser,
  setIsRestoringOAuthSession,
  setOAuthError,
}: {
  platform: IPlatformService;
  services: IServiceAccessor;
  refreshProviderState: () => Promise<void>;
  setUser: (user: UserInfo | null) => void;
  setIsRestoringOAuthSession: (restoring: boolean) => void;
  setOAuthError: (error: string | null) => void;
}): { hasOAuthProviders: boolean } {
  const { intl } = useZCodeIntl();
  const [hasOAuthProviders, setHasOAuthProviders] = useState(false);

  useEffect(() => {
    let disposed = false;
    void services.oauthService.getProviders().then(
      (providers) => {
        if (!disposed) setHasOAuthProviders(providers.length > 0);
      },
      (error: unknown) => {
        logger.warn("[Root] 加载登录渠道失败，按无渠道处理", { error });
      },
    );
    return () => {
      disposed = true;
    };
  }, [services]);

  useEffect(() => {
    let disposed = false;
    async function restoreOAuthSessionInBackground() {
      logger.info("[Root] 后台启动 OAuth 本地会话恢复");
      try {
        // 只读取登录成功时缓存的 user_info，展示态由“是否主动退出”决定，不做远端 token 校验。
        const result = await services.oauthService.restoreCachedSessionState();
        if (!disposed && result.status === "authenticated") {
          setUser(result.userInfo);
        }
      } catch (error) {
        logger.error("[Root] 恢复 OAuth 本地登录态失败:", error);
        if (disposed) {
          return;
        }
      }

      // 恢复主流程结束后立刻落定状态，让 footer 先显示 loading，再收敛到最终登录态。
      setIsRestoringOAuthSession(false);

      try {
        // Provider Runtime 刷新保持后台执行，避免首屏等待网络链路。
        await refreshProviderState();
      } catch (error) {
        // 启动刷新失败保留当前事实，继续由 Provider View 的正常更新驱动，不另起重试循环。
        logger.warn("[Root] 启动 Provider 状态刷新失败，继续观察后续更新", { error });
      }
    }

    void restoreOAuthSessionInBackground();

    return () => {
      disposed = true;
    };
  }, [refreshProviderState, services, setIsRestoringOAuthSession, setUser]);

  useEffect(() => {
    const disposeOAuth = platform.onOAuthCallback(async (url) => {
      try {
        const result = await services.oauthService.handleCallback(url);
        // 取消或切换 flow 会使已接收的回调失效，正常空结果不能被当作登录异常。
        if (!result) {
          logger.info("[Root] 已忽略失效 OAuth 回调");
          return;
        }
        await handleOAuthCallbackSuccess({
          result,
          platform,
          refreshProviderState,
          setUser,
          setOAuthError,
        });
      } catch (err) {
        // 登录页只保留统一可重试提示，具体原因进入 logger 便于排查。
        setOAuthError(intl.formatMessage({ id: "login.oauth.loginFailure" }));
        logger.error("[Root] OAuth 回调处理失败:", err);
      }
    });
    platform.notifyRendererReady();
    return () => {
      disposeOAuth();
    };
  }, [intl, platform, refreshProviderState, services, setUser, setOAuthError]);

  return { hasOAuthProviders };
}

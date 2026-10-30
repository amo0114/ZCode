import { createContext, useContext } from "react";
import type { ReactNode } from "react";
// 手机远控 relay V2 需要官方账号 JWT，fork 已移除账号体系，默认关闭入口。
const DEFAULT_WEB_REMOTE_CONTROL_FEATURE_ENABLED = false;

const WebRemoteControlFeatureContext = createContext(
  DEFAULT_WEB_REMOTE_CONTROL_FEATURE_ENABLED,
);

export function WebRemoteControlFeatureProvider({
  enabled = DEFAULT_WEB_REMOTE_CONTROL_FEATURE_ENABLED,
  children,
}: {
  enabled?: boolean;
  children: ReactNode;
}) {
  return (
    <WebRemoteControlFeatureContext.Provider value={enabled}>
      {children}
    </WebRemoteControlFeatureContext.Provider>
  );
}

export function useWebRemoteControlFeatureEnabled(): boolean {
  return useContext(WebRemoteControlFeatureContext);
}

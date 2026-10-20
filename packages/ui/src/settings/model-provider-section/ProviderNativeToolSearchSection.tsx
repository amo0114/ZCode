import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Switch } from "@/components/ui/switch.js";
import { useServices } from "@/hooks/useServices.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { logger } from "@/logger.js";

type ProbeStatus =
  | { kind: "idle" }
  | { kind: "probing" }
  | { kind: "supported" }
  | { kind: "unsupported"; detail?: string }
  | { kind: "error"; message: string };

/**
 * Anthropic 兼容渠道的原生 ToolSearch 开关：透传中转是否保留 beta 头与 defer_loading 无法从地址判断，
 * 由用户确认或「检测」写入配置；工具搜索为 auto 时只对开启的渠道走原生。
 */
export function ProviderNativeToolSearchSection(props: {
  checked: boolean;
  saving: boolean;
  /** 检测所需的当前连接草稿；缺任一项时不能检测。 */
  probeInput: { baseUrl: string; apiKey: string; modelId: string } | null;
  onCheckedChange: (enabled: boolean) => Promise<void>;
}) {
  const { intl } = useZCodeIntl();
  const { providerSettingsService } = useServices();
  const [status, setStatus] = useState<ProbeStatus>({ kind: "idle" });
  const busy = props.saving || status.kind === "probing";

  const probe = async () => {
    if (!props.probeInput) return;
    setStatus({ kind: "probing" });
    try {
      const result = await providerSettingsService.probeNativeToolSearch(props.probeInput);
      await props.onCheckedChange(result.supported);
      setStatus(
        result.supported
          ? { kind: "supported" }
          : { kind: "unsupported", ...(result.detail ? { detail: result.detail } : {}) },
      );
    } catch (error) {
      logger.warn("[ModelProviderSection] 原生 ToolSearch 检测失败", { error });
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const statusText =
    status.kind === "supported"
      ? intl.formatMessage({ id: "settings.modelProvider.nativeToolSearchSupported" })
      : status.kind === "unsupported"
        ? intl.formatMessage(
            { id: "settings.modelProvider.nativeToolSearchUnsupported" },
            { detail: status.detail ?? "" },
          )
        : status.kind === "error"
          ? intl.formatMessage(
              { id: "settings.modelProvider.nativeToolSearchProbeError" },
              { error: status.message },
            )
          : null;

  return (
    <div data-testid="model-provider-native-tool-search">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-ui-base text-foreground">
            {intl.formatMessage({ id: "settings.modelProvider.nativeToolSearch" })}
          </div>
          <div className="text-ui-sm text-foreground-subtle">
            {intl.formatMessage({ id: "settings.modelProvider.nativeToolSearchDescription" })}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="model-provider-native-tool-search-probe"
            disabled={busy || !props.probeInput}
            onClick={() => void probe()}
          >
            {status.kind === "probing" ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
            {intl.formatMessage({ id: "settings.modelProvider.nativeToolSearchProbe" })}
          </Button>
          <Switch
            data-testid="model-provider-native-tool-search-switch"
            aria-label={intl.formatMessage({ id: "settings.modelProvider.nativeToolSearch" })}
            checked={props.checked}
            disabled={busy}
            onCheckedChange={(enabled) => {
              setStatus({ kind: "idle" });
              void props.onCheckedChange(enabled).catch(() => undefined);
            }}
          />
        </div>
      </div>
      {statusText ? (
        <div
          data-testid="model-provider-native-tool-search-status"
          className={
            status.kind === "supported"
              ? "mt-1 text-ui-sm text-foreground-subtle"
              : "mt-1 break-all text-ui-sm text-destructive"
          }
        >
          {statusText}
        </div>
      ) : null}
    </div>
  );
}

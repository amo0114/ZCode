import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { SettingsGroupCard, SettingsRow } from "@/settings/SettingsPageParts.js";

/**
 * 安全边界设置。
 *
 * 背景：官方 Dual-use 条款对所有模型一视同仁，但不同供应商的对齐强度不同。
 * 这里让用户按模型决定——某些模型用放宽条款，某些强制官方条款，
 * 其余走默认（官方条款）。真正的判定在 agent 侧 `boundary-policy.ts`，
 * 本页只负责读写配置。
 *
 * 匹配方式是「关键词不区分大小写地出现在 providerId 或 modelId 里」，
 * 所以填 `deepseek` 能命中 `new-provider/deepseek-v4.1-flash` 这类任意接入。
 */
export interface SecurityBoundaryConfig {
  readonly unrestricted: readonly string[];
  readonly strict: readonly string[];
}

/** 配置读写端口。由宿主注入，Web 端与 Desktop 端实现不同。 */
export interface SecurityBoundaryPort {
  read(): Promise<SecurityBoundaryConfig>;
  write(config: SecurityBoundaryConfig): Promise<void>;
}

const EMPTY_CONFIG: SecurityBoundaryConfig = { unrestricted: [], strict: [] };

/** 关键词去重并保持顺序，空串过滤掉——空关键词会匹配一切，必须挡住。 */
function normalizeKeywords(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (value.length === 0) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function KeywordList({
  keywords,
  emptyHint,
  placeholder,
  onAdd,
  onRemove,
}: {
  keywords: readonly string[];
  emptyHint: string;
  placeholder: string;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="space-y-2">
      {keywords.length === 0 ? (
        <p className="text-ui-sm text-foreground-subtle">{emptyHint}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {keywords.map((keyword) => (
            <li
              key={keyword}
              className="inline-flex items-center gap-1 rounded-md bg-surface px-2 py-1 text-ui-sm"
            >
              <span className="font-mono">{keyword}</span>
              <button
                type="button"
                aria-label={`remove ${keyword}`}
                className="text-foreground-subtle hover:text-foreground"
                onClick={() => onRemove(keyword)}
              >
                <Trash2 className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            const value = draft.trim();
            if (!value) return;
            onAdd(value);
            setDraft("");
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const value = draft.trim();
            if (!value) return;
            onAdd(value);
            setDraft("");
          }}
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function SecurityBoundarySection({ port }: { port: SecurityBoundaryPort }) {
  const { intl } = useZCodeIntl();
  const [config, setConfig] = useState<SecurityBoundaryConfig>(EMPTY_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    port
      .read()
      .then((loaded) => {
        if (!alive) return;
        setConfig({
          unrestricted: normalizeKeywords(loaded.unrestricted),
          strict: normalizeKeywords(loaded.strict),
        });
      })
      .catch((cause: unknown) => {
        if (alive) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [port]);

  /** 每次改动立刻落盘：这个配置没有「应用」按钮，改完重启即生效。 */
  const persist = useCallback(
    (next: SecurityBoundaryConfig) => {
      setConfig(next);
      port.write(next).catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      });
    },
    [port],
  );

  const addKeyword = useCallback(
    (field: "unrestricted" | "strict", value: string) => {
      persist({
        ...config,
        [field]: normalizeKeywords([...config[field], value]),
      });
    },
    [config, persist],
  );

  const removeKeyword = useCallback(
    (field: "unrestricted" | "strict", value: string) => {
      persist({
        ...config,
        [field]: config[field].filter((keyword) => keyword !== value),
      });
    },
    [config, persist],
  );

  const isDefault = useMemo(
    () => config.unrestricted.length === 0 && config.strict.length === 0,
    [config],
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <p className="text-ui-sm text-foreground-subtle">
          {intl.formatMessage({ id: "settings.securityBoundary.loading" })}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsGroupCard>
        <SettingsRow
          label={intl.formatMessage({ id: "settings.securityBoundary.currentState" })}
          description={intl.formatMessage({ id: "settings.securityBoundary.currentStateDescription" })}
          control={
            <span className="inline-flex items-center gap-1.5 rounded-md bg-surface px-2.5 py-1 text-ui-sm">
              <ShieldCheck className="size-3.5" />
              {isDefault
                ? intl.formatMessage({ id: "settings.securityBoundary.stateAllOfficial" })
                : intl.formatMessage(
                    { id: "settings.securityBoundary.stateCustomized" },
                    {
                      unrestricted: config.unrestricted.length,
                      strict: config.strict.length,
                    },
                  )}
            </span>
          }
        />
      </SettingsGroupCard>

      <SettingsGroupCard>
        <SettingsRow
          label={intl.formatMessage({ id: "settings.securityBoundary.unrestrictedTitle" })}
          description={intl.formatMessage({
            id: "settings.securityBoundary.unrestrictedDescription",
          })}
          controlLayout="wide"
          control={
            <KeywordList
              keywords={config.unrestricted}
              emptyHint={intl.formatMessage({
                id: "settings.securityBoundary.unrestrictedEmpty",
              })}
              placeholder={intl.formatMessage({
                id: "settings.securityBoundary.keywordPlaceholder",
              })}
              onAdd={(value) => addKeyword("unrestricted", value)}
              onRemove={(value) => removeKeyword("unrestricted", value)}
            />
          }
        />
        <SettingsRow
          label={intl.formatMessage({ id: "settings.securityBoundary.strictTitle" })}
          description={intl.formatMessage({ id: "settings.securityBoundary.strictDescription" })}
          controlLayout="wide"
          control={
            <KeywordList
              keywords={config.strict}
              emptyHint={intl.formatMessage({ id: "settings.securityBoundary.strictEmpty" })}
              placeholder={intl.formatMessage({
                id: "settings.securityBoundary.keywordPlaceholder",
              })}
              onAdd={(value) => addKeyword("strict", value)}
              onRemove={(value) => removeKeyword("strict", value)}
            />
          }
        />
      </SettingsGroupCard>

      {error === null ? null : (
        <p className="text-ui-sm text-destructive">
          {intl.formatMessage({ id: "settings.securityBoundary.writeFailed" }, { error })}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-ui-sm text-foreground-subtle">
          {intl.formatMessage({ id: "settings.securityBoundary.restartHint" })}
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={isDefault}
          onClick={() => persist(EMPTY_CONFIG)}
        >
          <RotateCcw className="size-4" />
          {intl.formatMessage({ id: "settings.securityBoundary.reset" })}
        </Button>
      </div>
    </div>
  );
}

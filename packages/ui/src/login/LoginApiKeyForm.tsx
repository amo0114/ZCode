import { useState } from "react";
import {
  isApiKeyAccess,
  resolveProviderTemplateName,
  type ProviderApiType,
} from "@zcode/provider";
import { Loader2Icon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import {
  TID_LOGIN_API_KEY_BASE_URL_INPUT,
  TID_LOGIN_API_KEY_CANCEL_BUTTON,
  TID_LOGIN_API_KEY_CONTINUE_BUTTON,
  TID_LOGIN_API_KEY_ERROR,
  TID_LOGIN_API_KEY_INPUT,
  TID_LOGIN_API_KEY_MODEL_INPUT,
  TID_LOGIN_API_KEY_PROVIDER_ITEM,
  TID_LOGIN_API_KEY_PROVIDER_TRIGGER,
  TID_LOGIN_API_KEY_SKIP_BUTTON,
  testId,
} from "@zcode/shared";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useProviderSettingsView } from "@/hooks/useProviderSettingsView.js";
import { useServices } from "@/hooks/useServices.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { logger } from "@/logger.js";
import {
  buildLoginApiKeyDefaultModelPreferenceFromSelection,
  isValidCustomProviderBaseUrl,
  LOGIN_CUSTOM_PROVIDER_VALUE,
  resolveCustomProviderName,
  shouldShowLoginApiKeyLink,
} from "@/login/LoginApiKeyForm.helpers.js";
import { ProviderApiFormatSelect } from "@/settings/model-provider-section/ProviderApiFormatSelect.js";
import { ProviderLogo } from "@/settings/model-provider-section/ProviderLogo.js";
import { selectNewProviderTemplates } from "@/settings/model-provider-section/newProviderTemplates.js";
import { useZCodeStore } from "@/store/StoreProvider.js";

interface LoginApiKeyFormProps {
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
  onSkipped: () => void | Promise<void>;
}

export function LoginApiKeyForm({ onCancel, onSaved, onSkipped }: LoginApiKeyFormProps) {
  const { intl, locale } = useZCodeIntl();
  const platform = usePlatform();
  const { modelSelectionService, providerSettingsService } = useServices();
  const markApiKeyLoginSuccess = useZCodeStore((state) => state.markApiKeyLoginSuccess);
  // 不按语言预选任何一家，供应商与设置页「添加供应商」使用同一份可选 Template。
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [customApiFormat, setCustomApiFormat] = useState<ProviderApiType>("openai-chat-completions");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [customModelId, setCustomModelId] = useState("");
  const [saving, setSaving] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const providerSettingsRead = useProviderSettingsView();
  const providerSettingsView =
    providerSettingsRead.state.status === "ready" ? providerSettingsRead.state.view : null;

  const apiKeyTemplates = selectNewProviderTemplates(
    providerSettingsView?.providerTemplates ?? [],
  ).filter((template) => isApiKeyAccess(template.config.access));
  const isCustom = templateId === LOGIN_CUSTOM_PROVIDER_VALUE;
  const customBaseUrlInvalid =
    isCustom && customBaseUrl.trim().length > 0 && !isValidCustomProviderBaseUrl(customBaseUrl);
  const customReady =
    !isCustom || (isValidCustomProviderBaseUrl(customBaseUrl) && customModelId.trim().length > 0);
  const selectedTemplate = apiKeyTemplates.find((template) => template.templateId === templateId);
  const providerLabel = selectedTemplate
    ? resolveProviderTemplateName(selectedTemplate.templateId, selectedTemplate, locale)
    : (templateId ?? "");
  const templateAccess = selectedTemplate?.config.access;
  const apiKeyUrl = isApiKeyAccess(templateAccess) ? templateAccess.apiKeyManagementUrl : undefined;
  // 用户已经输入或回填 API Key 后，右侧获取入口会挤占密码输入区域。
  const showApiKeyLink = shouldShowLoginApiKeyLink(apiKeyValue, apiKeyUrl ?? undefined);

  const saveCustomProvider = async (apiKey: string) => {
    const created = await providerSettingsService.createPersonalProvider({
      providerName: resolveCustomProviderName(customBaseUrl),
      initialConfig: {
        api: { type: customApiFormat, baseUrl: customBaseUrl.trim() },
        access: { type: "api-key", apiKey },
      },
    });
    try {
      await providerSettingsService.addPersonalModel(created.providerId, customModelId.trim(), {}, true);
    } catch (modelError) {
      // 没有模型的 Provider 进入应用后不可用；回滚避免用户重试时累积多个同名半成品。
      await providerSettingsService.deletePersonalProvider(created.providerId).catch((rollbackError) => {
        logger.error("[LoginEntry] 回滚自定义 provider 失败", {
          providerId: created.providerId,
          error: rollbackError,
        });
      });
      throw modelError;
    }
    return created;
  };

  const saveApiKeyProvider = async () => {
    const apiKey = apiKeyValue.trim();
    if (!templateId || !customReady) return;
    if (!apiKey) {
      setError(intl.formatMessage({ id: "login.apiKey.emptyError" }));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (isCustom) {
        const created = await saveCustomProvider(apiKey);
        markApiKeyLoginSuccess(
          buildLoginApiKeyDefaultModelPreferenceFromSelection(
            await modelSelectionService.getView(),
            created.providerId,
          ),
        );
        await onSaved();
        return;
      }

      const template = (await providerSettingsService.getView()).providerTemplates.find(
        (item) => item.templateId === templateId,
      );
      if (!template || !isApiKeyAccess(template.config.access)) {
        setError(
          intl.formatMessage(
            { id: "login.apiKey.providerMissingError" },
            { provider: providerLabel },
          ),
        );
        return;
      }

      const created = await providerSettingsService.createPersonalProvider({
        templateId,
        initialConfig: { access: { type: template.config.access.type, apiKey } },
      });
      const defaultModelPreference = buildLoginApiKeyDefaultModelPreferenceFromSelection(
        await modelSelectionService.getView(),
        created.providerId,
      );
      markApiKeyLoginSuccess(defaultModelPreference);
      await onSaved();
    } catch (saveError) {
      logger.error("[LoginEntry] 保存 API Key provider 失败", {
        templateId,
        error: saveError,
      });
      setError(
        intl.formatMessage(
          { id: "login.apiKey.saveError" },
          {
            error: saveError instanceof Error ? saveError.message : String(saveError),
          },
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const skipApiKeyProvider = async () => {
    setSkipping(true);
    setError(null);
    try {
      // 跳过不能写入空 API Key 或触发 API Key 登录成功事件，否则后续模型选择会误以为已有可用凭据。
      await onSkipped();
    } catch (skipError) {
      logger.error("[LoginEntry] 跳过 API Key 登录失败", {
        templateId,
        error: skipError,
      });
      setError(
        intl.formatMessage(
          { id: "login.apiKey.skipError" },
          {
            error: skipError instanceof Error ? skipError.message : String(skipError),
          },
        ),
      );
    } finally {
      setSkipping(false);
    }
  };

  const busy = saving || skipping;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-ui-base font-medium text-foreground">
          {intl.formatMessage({ id: "login.apiKey.title" })}
        </h2>
        <div className="space-y-2">
          <div>
            <Select
              value={templateId ?? ""}
              onValueChange={(value) => {
                setTemplateId(value);
                setError(null);
              }}
              disabled={busy || providerSettingsView === null}
            >
              <SelectTrigger
                id="login-api-key-provider"
                size="lg"
                className="h-10 w-full text-ui-base"
                data-testid={TID_LOGIN_API_KEY_PROVIDER_TRIGGER}
                aria-label={intl.formatMessage({
                  id: "login.apiKey.providerLabel",
                })}
              >
                <SelectValue
                  placeholder={intl.formatMessage({ id: "login.apiKey.selectProvider" })}
                />
              </SelectTrigger>
              <SelectContent align="end" className="rounded-lg">
                {apiKeyTemplates.map((template) => (
                  <SelectItem
                    key={template.templateId}
                    value={template.templateId}
                    className="rounded-md"
                    data-testid={testId(TID_LOGIN_API_KEY_PROVIDER_ITEM, template.templateId)}
                  >
                    <ProviderLogo logo={template.config.logo} className="size-4 shrink-0" />
                    {resolveProviderTemplateName(template.templateId, template, locale)}
                  </SelectItem>
                ))}
                <SelectItem
                  value={LOGIN_CUSTOM_PROVIDER_VALUE}
                  className="rounded-md"
                  data-testid={testId(TID_LOGIN_API_KEY_PROVIDER_ITEM, "custom")}
                >
                  <PlusIcon className="size-4 shrink-0" aria-hidden="true" />
                  {intl.formatMessage({ id: "login.apiKey.customProvider" })}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isCustom ? (
            <>
              <ProviderApiFormatSelect value={customApiFormat} onChange={setCustomApiFormat} />
              <div className="space-y-1">
                <Input
                  type="text"
                  size="lg"
                  className="h-10 w-full text-ui-base"
                  data-testid={TID_LOGIN_API_KEY_BASE_URL_INPUT}
                  aria-label={intl.formatMessage({ id: "settings.modelProvider.baseUrl" })}
                  aria-invalid={customBaseUrlInvalid || undefined}
                  value={customBaseUrl}
                  placeholder={intl.formatMessage({ id: "settings.modelProvider.baseUrlPlaceholder" })}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                  onChange={(event) => {
                    setCustomBaseUrl(event.target.value);
                    setError(null);
                  }}
                />
                {customBaseUrlInvalid ? (
                  <p className="text-ui-sm text-destructive">
                    {intl.formatMessage({ id: "login.apiKey.customBaseUrlInvalid" })}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
          <div className="relative">
            <Input
              id="login-api-key"
              type="password"
              size="lg"
              className={`h-10 w-full text-ui-base ${showApiKeyLink ? "pr-28" : ""}`}
              data-testid={TID_LOGIN_API_KEY_INPUT}
              aria-label={intl.formatMessage({
                id: "login.apiKey.placeholder",
              })}
              value={apiKeyValue}
              placeholder={intl.formatMessage({
                id: "login.apiKey.placeholder",
              })}
              autoComplete="off"
              onChange={(event) => {
                setApiKeyValue(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && apiKeyValue.trim() && customReady && !busy) {
                  void saveApiKeyProvider();
                }
              }}
            />
            {showApiKeyLink ? (
              <button
                type="button"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ui-base font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                disabled={busy}
                onClick={() => {
                  if (apiKeyUrl) {
                    platform.openExternal(apiKeyUrl);
                  }
                }}
              >
                {intl.formatMessage({ id: "login.apiKey.getApiKey" })}
              </button>
            ) : null}
          </div>
          {isCustom ? (
            <Input
              type="text"
              size="lg"
              className="h-10 w-full text-ui-base"
              data-testid={TID_LOGIN_API_KEY_MODEL_INPUT}
              aria-label={intl.formatMessage({ id: "settings.modelProvider.modelId" })}
              value={customModelId}
              placeholder={intl.formatMessage({ id: "login.apiKey.customModelPlaceholder" })}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              onChange={(event) => {
                setCustomModelId(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && apiKeyValue.trim() && customReady && !busy) {
                  void saveApiKeyProvider();
                }
              }}
            />
          ) : null}
        </div>
      </div>

      {error ? (
        <Alert variant="destructive" data-testid={TID_LOGIN_API_KEY_ERROR}>
          <TriangleAlertIcon className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Button
          type="button"
          className="h-10 w-full text-ui-base"
          size="lg"
          data-testid={TID_LOGIN_API_KEY_CONTINUE_BUTTON}
          disabled={!templateId || !apiKeyValue.trim() || !customReady || busy}
          onClick={() => void saveApiKeyProvider()}
        >
          {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {intl.formatMessage({ id: "login.apiKey.continue" })}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full text-ui-base"
          size="lg"
          data-testid={TID_LOGIN_API_KEY_CANCEL_BUTTON}
          disabled={busy}
          onClick={onCancel}
        >
          {intl.formatMessage({ id: "login.apiKey.cancel" })}
        </Button>
        <Button
          type="button"
          variant="link"
          className="h-7 w-full text-ui-base text-foreground-subtle hover:text-foreground"
          data-testid={TID_LOGIN_API_KEY_SKIP_BUTTON}
          disabled={busy}
          onClick={() => void skipApiKeyProvider()}
        >
          {skipping ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {intl.formatMessage({ id: "login.skip" })}
        </Button>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import {
  isApiKeyAccess,
  resolveProviderTemplateName,
  type ProviderApiType,
  type RecommendedModelConfig,
} from "@zcode/provider";
import { Loader2Icon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import {
  TID_LOGIN_API_KEY_BASE_URL_INPUT,
  TID_LOGIN_API_KEY_CANCEL_BUTTON,
  TID_LOGIN_API_KEY_FETCH_MODELS_BUTTON,
  TID_LOGIN_API_KEY_CONTINUE_BUTTON,
  TID_LOGIN_API_KEY_ERROR,
  TID_LOGIN_API_KEY_INPUT,
  TID_LOGIN_API_KEY_MODEL_CAPABILITY,
  TID_LOGIN_API_KEY_MODEL_INPUT,
  TID_LOGIN_API_KEY_NAME_INPUT,
  TID_LOGIN_API_KEY_PROVIDER_ITEM,
  TID_LOGIN_API_KEY_PROVIDER_TRIGGER,
  TID_LOGIN_API_KEY_SKIP_BUTTON,
  testId,
} from "@zcode/shared";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import { Button } from "@/components/ui/button.js";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.js";
import { Input } from "@/components/ui/input.js";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover.js";
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
  buildCustomProviderApiConfig,
  buildLoginApiKeyDefaultModelPreferenceFromSelection,
  isValidCustomProviderBaseUrl,
  LOGIN_CUSTOM_PROVIDER_VALUE,
  resolveCustomProviderName,
  shouldShowLoginApiKeyLink,
  summarizeRecommendedModelConfig,
} from "@/login/LoginApiKeyForm.helpers.js";
import { ProviderApiFormatSelect } from "@/settings/model-provider-section/ProviderApiFormatSelect.js";
import { ProviderLogo } from "@/settings/model-provider-section/ProviderLogo.js";
import { ProviderNativeToolSearchSection } from "@/settings/model-provider-section/ProviderNativeToolSearchSection.js";
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
  const [customName, setCustomName] = useState("");
  const [customNativeToolSearch, setCustomNativeToolSearch] = useState(false);
  const [recommendedModelConfig, setRecommendedModelConfig] =
    useState<RecommendedModelConfig | null>(null);
  const [remoteModels, setRemoteModels] = useState<readonly string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
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

  const customBaseUrlValid = isValidCustomProviderBaseUrl(customBaseUrl);
  const trimmedCustomModelId = customModelId.trim();
  const customSupportsNativeToolSearchOption = isCustom && customApiFormat === "anthropic-messages";
  // 检测结论只对当时的端点成立；地址或格式变化后回到未确认状态。
  useEffect(() => {
    setCustomNativeToolSearch(false);
  }, [customApiFormat, customBaseUrl]);
  const customNativeToolSearchProbeInput =
    customBaseUrlValid && apiKeyValue.trim() && trimmedCustomModelId
      ? { baseUrl: customBaseUrl.trim(), apiKey: apiKeyValue.trim(), modelId: trimmedCustomModelId }
      : null;
  useEffect(() => {
    setRecommendedModelConfig(null);
    if (!isCustom || !customBaseUrlValid || !trimmedCustomModelId) return;
    let cancelled = false;
    // 输入模型 ID 时逐字触发，防抖后再解析，避免每个按键都走一次 RPC。
    const timer = setTimeout(() => {
      providerSettingsService
        .resolveRecommendedModelConfig({
          apiType: customApiFormat,
          baseUrl: customBaseUrl.trim(),
          modelId: trimmedCustomModelId,
        })
        .then((result) => {
          if (!cancelled) setRecommendedModelConfig(result);
        })
        .catch((resolveError) => {
          logger.warn("[LoginEntry] 解析自定义模型推荐配置失败", { error: resolveError });
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    customApiFormat,
    customBaseUrl,
    customBaseUrlValid,
    isCustom,
    providerSettingsService,
    trimmedCustomModelId,
  ]);

  const formatCapabilitySummary = (config: RecommendedModelConfig["config"]) => {
    const summary = summarizeRecommendedModelConfig(config);
    return [
      summary.contextWindow
        ? intl.formatMessage(
            { id: "login.apiKey.capability.context" },
            { value: summary.contextWindow },
          )
        : null,
      summary.maxOutputTokens
        ? intl.formatMessage(
            { id: "login.apiKey.capability.maxOutput" },
            { value: summary.maxOutputTokens },
          )
        : null,
      summary.reasoningLevels > 0
        ? intl.formatMessage(
            { id: "login.apiKey.capability.reasoning" },
            { count: summary.reasoningLevels },
          )
        : intl.formatMessage({ id: "login.apiKey.capability.noReasoning" }),
      summary.supportsImage ? intl.formatMessage({ id: "login.apiKey.capability.image" }) : null,
      summary.supportsToolCall
        ? null
        : intl.formatMessage({ id: "login.apiKey.capability.noToolCall" }),
    ]
      .filter((item) => item !== null)
      .join(" · ");
  };
  const derivedCustomName = resolveCustomProviderName(customBaseUrl);

  const canFetchModels =
    isValidCustomProviderBaseUrl(customBaseUrl) && apiKeyValue.trim().length > 0 && !fetchingModels;

  const fetchRemoteModels = async () => {
    setFetchingModels(true);
    setError(null);
    try {
      const models = await providerSettingsService.listRemoteModels({
        apiType: customApiFormat,
        baseUrl: customBaseUrl.trim(),
        apiKey: apiKeyValue.trim(),
      });
      if (models.length === 0) {
        setError(intl.formatMessage({ id: "login.apiKey.fetchModelsError" }));
        return;
      }
      setRemoteModels(models);
      setModelPickerOpen(true);
    } catch (fetchError) {
      logger.warn("[LoginEntry] 获取自定义 provider 模型列表失败", { error: fetchError });
      setError(intl.formatMessage({ id: "login.apiKey.fetchModelsError" }));
    } finally {
      setFetchingModels(false);
    }
  };

  const saveCustomProvider = async (apiKey: string) => {
    const created = await providerSettingsService.createPersonalProvider({
      providerName: customName.trim() || derivedCustomName,
      initialConfig: {
        api: buildCustomProviderApiConfig({
          apiType: customApiFormat,
          baseUrl: customBaseUrl,
          nativeToolSearch: customNativeToolSearch,
        }),
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
              {/* 选项多达近 20 个，item-aligned 会盖住触发器并随选中项上下跳动，改为在触发器下方弹出。 */}
              <SelectContent
                position="popper"
                side="bottom"
                sideOffset={4}
                collisionPadding={16}
                className="max-h-80 rounded-lg"
              >
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
              <Input
                type="text"
                size="lg"
                className="h-10 w-full text-ui-base"
                data-testid={TID_LOGIN_API_KEY_NAME_INPUT}
                aria-label={intl.formatMessage({ id: "login.apiKey.customNamePlaceholder" })}
                value={customName}
                placeholder={
                  derivedCustomName
                    ? intl.formatMessage(
                        { id: "login.apiKey.customNamePlaceholderWithDefault" },
                        { name: derivedCustomName },
                      )
                    : intl.formatMessage({ id: "login.apiKey.customNamePlaceholder" })
                }
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                onChange={(event) => setCustomName(event.target.value)}
              />
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
            <Popover open={modelPickerOpen} onOpenChange={setModelPickerOpen}>
              <PopoverAnchor asChild>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    size="lg"
                    className="h-10 min-w-0 flex-1 text-ui-base"
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
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="h-10 shrink-0 text-ui-base"
                    data-testid={TID_LOGIN_API_KEY_FETCH_MODELS_BUTTON}
                    disabled={busy || !canFetchModels}
                    onClick={() => void fetchRemoteModels()}
                  >
                    {fetchingModels ? <Loader2Icon className="size-4 animate-spin" /> : null}
                    {intl.formatMessage({ id: "login.apiKey.fetchModels" })}
                  </Button>
                </div>
              </PopoverAnchor>
              <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
                <Command>
                  <CommandInput
                    placeholder={intl.formatMessage({ id: "login.apiKey.searchModels" })}
                  />
                  <CommandList className="max-h-64">
                    <CommandEmpty>
                      {intl.formatMessage({ id: "login.apiKey.noModelsFound" })}
                    </CommandEmpty>
                    {remoteModels.map((modelId) => (
                      <CommandItem
                        key={modelId}
                        value={modelId}
                        onSelect={() => {
                          setCustomModelId(modelId);
                          setModelPickerOpen(false);
                          setError(null);
                        }}
                      >
                        {modelId}
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          ) : null}
          {isCustom && recommendedModelConfig ? (
            <p
              className="text-ui-sm text-foreground-subtle"
              data-testid={TID_LOGIN_API_KEY_MODEL_CAPABILITY}
              data-recognized={recommendedModelConfig.recognized}
            >
              {intl.formatMessage(
                {
                  id: recommendedModelConfig.recognized
                    ? "login.apiKey.modelRecognized"
                    : "login.apiKey.modelUnrecognized",
                },
                { summary: formatCapabilitySummary(recommendedModelConfig.config) },
              )}
            </p>
          ) : null}
          {customSupportsNativeToolSearchOption ? (
            <ProviderNativeToolSearchSection
              // 端点变化时重置检测提示，避免沿用对旧地址的结论。
              key={`${customApiFormat}\n${customBaseUrl.trim()}`}
              checked={customNativeToolSearch}
              saving={saving}
              probeInput={customNativeToolSearchProbeInput}
              onCheckedChange={async (enabled) => setCustomNativeToolSearch(enabled)}
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

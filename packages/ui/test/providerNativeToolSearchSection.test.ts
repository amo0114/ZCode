// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProviderNativeToolSearchSection } from "@/settings/model-provider-section/ProviderNativeToolSearchSection.js";

const h = vi.hoisted(() => ({
  providerSettingsService: { probeNativeToolSearch: vi.fn() },
}));
vi.mock("@/hooks/useServices.js", () => ({
  useServices: () => ({ providerSettingsService: h.providerSettingsService }),
}));
vi.mock("@/i18n/IntlProvider.js", () => ({
  useZCodeIntl: () => ({
    intl: {
      formatMessage: ({ id }: { id: string }, values?: Record<string, string>) =>
        values ? `${id}:${Object.values(values).join(",")}` : id,
    },
  }),
}));

const probeInput = { baseUrl: "https://relay.test", apiKey: "sk", modelId: "claude" };

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

function renderSection(props: Partial<Parameters<typeof ProviderNativeToolSearchSection>[0]>) {
  const onCheckedChange = vi.fn(async () => {});
  render(
    createElement(ProviderNativeToolSearchSection, {
      checked: false,
      saving: false,
      probeInput,
      onCheckedChange,
      ...props,
    }),
  );
  return onCheckedChange;
}

it("检测通过后写入开启并提示", async () => {
  h.providerSettingsService.probeNativeToolSearch.mockResolvedValue({ supported: true });
  const onCheckedChange = renderSection({});
  fireEvent.click(screen.getByTestId("model-provider-native-tool-search-probe"));
  await waitFor(() =>
    expect(screen.getByTestId("model-provider-native-tool-search-status").textContent).toBe(
      "settings.modelProvider.nativeToolSearchSupported",
    ),
  );
  expect(h.providerSettingsService.probeNativeToolSearch).toHaveBeenCalledWith(probeInput);
  expect(onCheckedChange).toHaveBeenCalledWith(true);
});

it("端点拒绝时写入关闭并带回错误摘要", async () => {
  h.providerSettingsService.probeNativeToolSearch.mockResolvedValue({
    supported: false,
    detail: "defer_loading unknown",
  });
  const onCheckedChange = renderSection({ checked: true });
  fireEvent.click(screen.getByTestId("model-provider-native-tool-search-probe"));
  await waitFor(() =>
    expect(screen.getByTestId("model-provider-native-tool-search-status").textContent).toBe(
      "settings.modelProvider.nativeToolSearchUnsupported:defer_loading unknown",
    ),
  );
  expect(onCheckedChange).toHaveBeenCalledWith(false);
});

it("鉴权等检测失败不改动开关", async () => {
  h.providerSettingsService.probeNativeToolSearch.mockRejectedValue(new Error("HTTP 401"));
  const onCheckedChange = renderSection({});
  fireEvent.click(screen.getByTestId("model-provider-native-tool-search-probe"));
  await waitFor(() =>
    expect(screen.getByTestId("model-provider-native-tool-search-status").textContent).toBe(
      "settings.modelProvider.nativeToolSearchProbeError:HTTP 401",
    ),
  );
  expect(onCheckedChange).not.toHaveBeenCalled();
});

it("缺少连接信息或模型时不能检测", () => {
  renderSection({ probeInput: null });
  expect(
    screen.getByTestId("model-provider-native-tool-search-probe").hasAttribute("disabled"),
  ).toBe(true);
});

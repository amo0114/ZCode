import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEB_REMOTE_CONTROL_RELAY_WS_URL,
  DEFAULT_ZCODE_ENDPOINT_ORIGIN,
  TEST_ZCODE_ENDPOINT_ORIGIN,
  buildRuntimeZCodeApiUrl,
  buildZCodeEndpointUrls,
  normalizeZCodeEndpointOrigin,
  resolveRuntimeZCodeEndpointOrigin,
  resolveWebRemoteControlRelayWsUrl,
  resolveZCodeEndpointOrigin,
} from "../src/zcodeEndpoint.js";
import { appSettingsPatchSchema, appSettingsSchema } from "../src/validationAppSettings.js";

describe("zcodeEndpoint", () => {
  it("defaults to the scoped origin in every env without env base url", () => {
    expect(resolveZCodeEndpointOrigin({ env: "test" })).toBe(TEST_ZCODE_ENDPOINT_ORIGIN);
    expect(resolveZCodeEndpointOrigin({ env: "production" })).toBe(DEFAULT_ZCODE_ENDPOINT_ORIGIN);
  });

  it("uses ZCODE_BASE_URL style env base as the default endpoint", () => {
    expect(
      resolveZCodeEndpointOrigin({
        env: "test",
        envBaseOrigin: "https://zcode.z.ai/api/v1",
      }),
    ).toBe(TEST_ZCODE_ENDPOINT_ORIGIN);
    expect(
      resolveZCodeEndpointOrigin({
        env: "production",
        envBaseOrigin: "https://zcode.z.ai/api/v1",
      }),
    ).toBe(DEFAULT_ZCODE_ENDPOINT_ORIGIN);
  });

  it("keeps the non-production settings override above env base url", () => {
    expect(
      resolveZCodeEndpointOrigin({
        env: "test",
        envBaseOrigin: "https://zcode.z.ai",
        overrideOrigin: "http://localhost:3030/api/v1",
      }),
    ).toBe("http://localhost:3030");
  });

  it("uses a non-production override after normalizing to origin", () => {
    expect(
      resolveZCodeEndpointOrigin({
        env: "test",
        overrideOrigin: "https://zcode.z.ai/api/v1/ignored?x=1",
      }),
    ).toBe(TEST_ZCODE_ENDPOINT_ORIGIN);
  });

  it("ignores overrides in production", () => {
    expect(
      resolveZCodeEndpointOrigin({
        env: "production",
        envBaseOrigin: "https://zcode.z.ai",
        overrideOrigin: "https://zcode.z.ai",
      }),
    ).toBe(DEFAULT_ZCODE_ENDPOINT_ORIGIN);
  });

  it("derives http and websocket urls from the same origin", () => {
    expect(buildZCodeEndpointUrls("http://localhost:3030")).toEqual({
      origin: "http://localhost:3030",
      apiBaseUrl: "http://localhost:3030/api/v1",
      remoteUrl: "http://localhost:3030/remote/v3",
      relayWsUrl: "ws://localhost:3030/ws",
    });
  });

  it("uses remote v3 for app versions below 3.4.0", () => {
    expect(buildZCodeEndpointUrls("https://zcode.z.ai", { appVersion: "3.3.9" }).remoteUrl).toBe(
      "https://zcode.z.ai/remote/v3",
    );
  });

  it("uses remote v4 for app versions at or above 3.4.0", () => {
    expect(buildZCodeEndpointUrls("https://zcode.z.ai", { appVersion: "3.4.0" }).remoteUrl).toBe(
      "https://zcode.z.ai/remote/v4",
    );
    expect(buildZCodeEndpointUrls("https://zcode.z.ai", { appVersion: "3.4.1" }).remoteUrl).toBe(
      "https://zcode.z.ai/remote/v4",
    );
    expect(
      buildZCodeEndpointUrls("https://zcode.z.ai", { appVersion: "3.5.0-beta.1" }).remoteUrl,
    ).toBe("https://zcode.z.ai/remote/v4");
  });

  it("keeps prerelease and invalid app versions on remote v3", () => {
    expect(
      buildZCodeEndpointUrls("https://zcode.z.ai", { appVersion: "3.4.0-beta.1" }).remoteUrl,
    ).toBe("https://zcode.z.ai/remote/v3");
    expect(buildZCodeEndpointUrls("https://zcode.z.ai", { appVersion: "dev" }).remoteUrl).toBe(
      "https://zcode.z.ai/remote/v3",
    );
    expect(buildZCodeEndpointUrls("https://zcode.z.ai", { appVersion: "03.4.0" }).remoteUrl).toBe(
      "https://zcode.z.ai/remote/v3",
    );
    expect(
      buildZCodeEndpointUrls("https://zcode.z.ai", { appVersion: "3.4.1-alpha..1" }).remoteUrl,
    ).toBe("https://zcode.z.ai/remote/v3");
    expect(buildZCodeEndpointUrls("https://zcode.z.ai", { appVersion: "3.4.1-01" }).remoteUrl).toBe(
      "https://zcode.z.ai/remote/v3",
    );
  });

  it("uses the test relay only for the standard test endpoint", () => {
    expect(
      resolveWebRemoteControlRelayWsUrl({
        endpointOrigin: TEST_ZCODE_ENDPOINT_ORIGIN,
      }),
    ).toBe("wss://zcode.z.ai/ws");
    expect(
      resolveWebRemoteControlRelayWsUrl({
        endpointOrigin: DEFAULT_ZCODE_ENDPOINT_ORIGIN,
      }),
    ).toBe(DEFAULT_WEB_REMOTE_CONTROL_RELAY_WS_URL);
    expect(
      resolveWebRemoteControlRelayWsUrl({
        endpointOrigin: "http://localhost:3030",
      }),
    ).toBe(DEFAULT_WEB_REMOTE_CONTROL_RELAY_WS_URL);
  });

  it("allows an explicit web remote control relay url override", () => {
    expect(
      resolveWebRemoteControlRelayWsUrl({
        endpointOrigin: TEST_ZCODE_ENDPOINT_ORIGIN,
        overrideUrl: " ws://localhost:8787/ws ",
      }),
    ).toBe("ws://localhost:8787/ws");
  });

  it("builds product endpoint URLs from the selected environment", () => {
    expect(buildRuntimeZCodeApiUrl({ ZCODE_ENV: "test" }, "/api/v1/oauth/token")).toBe(
      "https://zcode.z.ai/api/v1/oauth/token",
    );
  });

  it("keeps environment-scoped endpoint overrides centralized", () => {
    expect(
      resolveRuntimeZCodeEndpointOrigin({
        ZCODE_ENV: "test",
        ZCODE_TEST_BASE_URL: "https://test-zcode.example.com/path",
      }),
    ).toBe("https://test-zcode.example.com");
  });

  it("ignores blank runtime endpoint overrides", () => {
    expect(
      resolveRuntimeZCodeEndpointOrigin({
        ZCODE_ENV: "test",
        ZCODE_BASE_URL: " ",
        ZCODE_TEST_BASE_URL: "\t",
      }),
    ).toBe(TEST_ZCODE_ENDPOINT_ORIGIN);
  });

  it("rejects non-http endpoint origins", () => {
    expect(() => normalizeZCodeEndpointOrigin("file:///tmp/zcode")).toThrow(/http or https/);
  });

  it("persists optional endpoint override in app settings", () => {
    expect(
      appSettingsSchema.parse({ zcodeEndpointOrigin: "https://zcode.z.ai/path" })
        .zcodeEndpointOrigin,
    ).toBe(TEST_ZCODE_ENDPOINT_ORIGIN);
    expect(
      appSettingsPatchSchema.parse({ zcodeEndpointOrigin: "http://localhost:3030/foo" })
        .zcodeEndpointOrigin,
    ).toBe("http://localhost:3030");
  });
});

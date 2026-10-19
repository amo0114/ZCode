import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createTelemetryCore } from "../src/telemetry/telemetryCore.js";

const homes: string[] = [];
afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});
const context = {
  clientLanguage: "zh-CN",
  clientTimezone: "Asia/Shanghai",
  screenResolution: "100x100",
};

it("adds every public header and never attaches Authorization", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "telemetry-headers-"));
  homes.push(homeDir);
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValue(new Response(null, { status: 204 }));
  const core = createTelemetryCore({
    homeDir,
    fetchImpl,
    loadUserId: async () => "user-1",
    appVersion: "1.2.3",
    platform: "darwin",
    arch: "arm64",
    osVersion: "24.0",
    releaseChannel: "test",
    randomUUID: () => "device-1",
    resolveZCodeEndpointOrigin: () => "https://zcode.z.ai",
    sleep: async () => {},
  });
  await core.reportAppLaunch(context);
  expect(fetchImpl.mock.calls[0]?.[1]?.redirect).toBe("error");
  expect(fetchImpl.mock.calls[0]?.[1]?.headers).toEqual({
    "Content-Type": "application/json",
    "User-Agent": "ZCode/1.2.3",
    "HTTP-Referer": "https://zcode.z.ai",
    "X-Title": "Z Code@electron",
    "X-ZCode-App-Version": "1.2.3",
    "X-Platform": "darwin-arm64",
    "X-Release-Channel": "test",
    "X-Client-Language": "zh-CN",
    "X-Client-Timezone": "Asia/Shanghai",
    "X-Os-Category": "macos",
    "X-Os-Version": "24.0",
    "X-Device-Mid": "device-1",
  });
  // 重试复用同一份正文，同样不带 Authorization。
  expect(new Headers(fetchImpl.mock.calls[1]?.[1]?.headers).has("Authorization")).toBe(false);
  expect(fetchImpl.mock.calls[1]?.[1]?.body).toBe(fetchImpl.mock.calls[0]?.[1]?.body);
});

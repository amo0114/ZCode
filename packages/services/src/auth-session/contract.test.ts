import { describe, expect, it } from "vitest";
import { createAuthSessionReader } from "./authSessionReader.js";
import { exampleTelemetryUserId } from "./contract.example.js";

function credentials(entries: Record<string, string>) {
  return { load: async (key: string) => entries[key] ?? null };
}

const profile = JSON.stringify({ id: "account-1", username: "user", displayName: "User" });

describe("auth-session contract", () => {
  it("没有注册渠道时即使磁盘留有旧凭据也按未登录处理", async () => {
    const reader = createAuthSessionReader(
      credentials({ "oauth:active_provider": "zai", "oauth:zai:user_info": profile }),
    );
    await expect(reader.getActiveIdentity()).resolves.toBeNull();
    await expect(reader.loadActiveProfile()).resolves.toBeNull();
    await expect(exampleTelemetryUserId(reader)).resolves.toBe("");
  });

  it("已注册渠道返回当前身份", async () => {
    const reader = createAuthSessionReader(
      credentials({ "oauth:active_provider": "mock", "oauth:mock:user_info": profile }),
      ["mock"],
    );
    await expect(reader.getActiveIdentity()).resolves.toEqual({
      channelId: "mock",
      accountId: "account-1",
    });
    await expect(exampleTelemetryUserId(reader)).resolves.toBe("account-1");
  });

  it("凭据解密失败按未登录处理且不写入", async () => {
    const reader = createAuthSessionReader(
      {
        load: async () => {
          throw Object.assign(new Error("凭据解密失败：bad"), {
            code: "ZCODE_CREDENTIAL_DECRYPT_FAILED",
          });
        },
      },
      ["mock"],
    );
    await expect(reader.loadActiveProfile()).resolves.toBeNull();
  });
});

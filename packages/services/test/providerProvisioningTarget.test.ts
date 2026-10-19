import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelConfigRules, ProviderConfigMap } from "@zcode/provider";
import { NodePersonalProviderConfigRepository } from "@zcode/provider-node";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProviderProvisioningSource } from "../src/model-provider/providerProvisioningSource.js";
import { createProviderProvisioningTarget } from "../src/model-provider/providerProvisioningTarget.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

function createEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 3,
    syncId: "sync-1",
    personalConfig: {
      providerConfigRules: {
        providerRules: [
          {
            providerId: "custom",
            config: {
              group: "standard-personal",
              access: { type: "api-key", apiKey: "new-key" },
              api: { type: "openai-chat-completions", baseUrl: "https://example.com/v1" },
              personalModelIds: ["model-a"],
            },
          },
        ],
      },
      modelConfigRules: { providerModelRules: [], manualProviderModelRules: [] },
      providerOrder: ["custom"],
      defaultModelSelection: { providerId: "custom", modelId: "model-a" },
    },
    ...overrides,
  };
}

async function createTarget(overrides: { refresh?: () => Promise<unknown> } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "provider-provisioning-target-"));
  const personalConfigFilePath = join(directory, "provider_config.json");
  const personal = new NodePersonalProviderConfigRepository({
    filePath: personalConfigFilePath,
    pollingIntervalMs: false,
  });
  cleanups.push(async () => {
    personal.dispose();
    await rm(directory, { recursive: true, force: true });
  });
  await personal.update(() => ({
    providers: ProviderConfigMap.empty(),
    models: ModelConfigRules.empty(),
    providerOrder: [],
    defaultModelSelection: { providerId: "old", modelId: "old-model" },
  }));
  const replacePersonalConfig = vi.spyOn(personal, "update");
  const target = createProviderProvisioningTarget({
    providerRuntime: {
      start: vi.fn(async () => undefined),
      registryService: {
        refresh: vi.fn(async () => {
          await overrides.refresh?.();
          return { sourceRevisions: { config: "target-revision" } };
        }),
      },
    } as never,
    personalRepository: personal,
    personalConfigFilePath,
    stateFilePath: join(directory, "provisioning.json"),
  });
  return { target, personal, replacePersonalConfig, personalConfigFilePath, directory };
}

describe("Provider Provisioning Target", () => {
  it.each(["refresh", "commit"])("%s 阶段失败保留安全错误码且回滚原数据", async (phase) => {
    const f = await createTarget({
      refresh:
        phase === "refresh"
          ? vi.fn().mockRejectedValueOnce(new Error("fixture refresh failed"))
          : undefined,
    });
    const before = await f.personal.read();
    if (phase === "commit") await mkdir(join(f.directory, "provisioning.json"));
    expect(await f.target.apply(createEnvelope() as never)).toMatchObject({
      status: "failed",
      errorCode: phase === "refresh" ? "target-refresh-failed" : "target-commit-failed",
      rolledBack: true,
    });
    expect((await f.personal.read()).revision).toBe(before.revision);
    expect(f.replacePersonalConfig).toHaveBeenCalledTimes(2);
  });

  it("Source 产出的信封可被 Target 直接应用", async () => {
    const f = await createTarget();
    const source = createProviderProvisioningSource({
      personalRepository: f.personal,
      personalConfigFilePath: f.personalConfigFilePath,
    });
    const envelope = await source.read("new-source");
    // 空配置无默认模型，避免测试 fake Registry 对未知默认的校验影响协议断言。
    delete envelope.personalConfig.defaultModelSelection;
    await expect(f.target.apply(envelope)).resolves.toMatchObject({ status: "applied" });
  });

  it.each([0, 1, 2, 99])("未知 schemaVersion=%s 在任何写入前失败", async (schemaVersion) => {
    const f = await createTarget();
    await expect(f.target.apply(createEnvelope({ schemaVersion }) as never)).rejects.toThrow();
    expect(f.replacePersonalConfig).not.toHaveBeenCalled();
  });

  it("v3 拒绝旧信封的账号设置与凭据字段", async () => {
    const f = await createTarget();
    await expect(
      f.target.apply(
        createEnvelope({
          credentials: [{ scope: "oauth-session", key: "zcodejwttoken", value: "fixture" }],
        }) as never,
      ),
    ).rejects.toThrow();
    expect(f.replacePersonalConfig).not.toHaveBeenCalled();
  });

  it("writes the personal config, refreshes the registry and is idempotent", async () => {
    const { target, personal, replacePersonalConfig } = await createTarget();

    await expect(target.apply(createEnvelope() as never)).resolves.toMatchObject({
      status: "applied",
      syncId: "sync-1",
      personalProviderCount: 1,
      configRevision: "target-revision",
      rolledBack: false,
    });
    expect(replacePersonalConfig).toHaveBeenCalledOnce();
    expect((await personal.read()).defaultModelSelection).toEqual({
      providerId: "custom",
      modelId: "model-a",
    });

    await expect(target.apply(createEnvelope() as never)).resolves.toMatchObject({
      status: "already-applied",
      syncId: "sync-1",
    });
    expect(replacePersonalConfig).toHaveBeenCalledOnce();
  });

  it("keeps an idempotency history so an older retry cannot reapply stale data", async () => {
    const { target, replacePersonalConfig } = await createTarget();

    await expect(
      target.apply(createEnvelope({ syncId: "sync-a" }) as never),
    ).resolves.toMatchObject({ status: "applied" });
    await expect(
      target.apply(createEnvelope({ syncId: "sync-b" }) as never),
    ).resolves.toMatchObject({ status: "applied" });
    await expect(
      target.apply(createEnvelope({ syncId: "sync-a" }) as never),
    ).resolves.toMatchObject({ status: "already-applied", syncId: "sync-a" });
    expect(replacePersonalConfig).toHaveBeenCalledTimes(2);
  });

  it("applies an empty Personal snapshot so local deletion clears the remote mirror", async () => {
    const { target, replacePersonalConfig } = await createTarget();
    await expect(
      target.apply(
        createEnvelope({
          syncId: "sync-empty-overlay",
          personalConfig: {
            providerConfigRules: { providerRules: [] },
            modelConfigRules: { providerModelRules: [], manualProviderModelRules: [] },
            providerOrder: [],
          },
        }) as never,
      ),
    ).resolves.toMatchObject({ status: "applied", personalProviderCount: 0 });
    expect(replacePersonalConfig).toHaveBeenCalledOnce();
    expect(
      (await replacePersonalConfig.mock.results[0]!.value).defaultModelSelection,
    ).toBeUndefined();
  });

  it("does not overwrite a personal config changed concurrently when rollback starts", async () => {
    let personalRef: NodePersonalProviderConfigRepository | undefined;
    const f = await createTarget({
      refresh: vi.fn().mockImplementationOnce(async () => {
        await personalRef!.update((current) => ({
          ...current,
          defaultModelSelection: { providerId: "concurrent", modelId: "concurrent-model" },
        }));
        throw new Error("registry refresh failed");
      }),
    });
    personalRef = f.personal;

    await expect(
      f.target.apply(createEnvelope({ syncId: "sync-concurrent" }) as never),
    ).resolves.toMatchObject({ status: "rollback_failed", rolledBack: false });
    expect((await f.personal.read()).defaultModelSelection).toEqual({
      providerId: "concurrent",
      modelId: "concurrent-model",
    });
  });
});

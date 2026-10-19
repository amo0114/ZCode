import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelConfigRules, parsePersonalProviderConfigMap } from "@zcode/provider";
import {
  NodePersonalProviderConfigRepository,
  encodeProviderConfigFile,
} from "@zcode/provider-node";
import { afterEach, describe, expect, it } from "vitest";
import { createProviderProvisioningSource } from "../src/model-provider/providerProvisioningSource.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
function personalRepository(root: string) {
  const repo = new NodePersonalProviderConfigRepository({
    filePath: join(root, "provider_config.json"),
    pollingIntervalMs: false,
  });
  cleanups.push(async () => {
    repo.dispose();
    await rm(root, { recursive: true, force: true });
  });
  return repo;
}

describe("Provider Provisioning Source", () => {
  it("exports only the sparse Personal Config and its default selection", async () => {
    const root = await mkdtemp(join(tmpdir(), "zcode-provider-provisioning-source-"));
    const repository = personalRepository(root);
    await repository.update(() => ({
      providers: parsePersonalProviderConfigMap({
        providerRules: [
          {
            providerId: "custom",
            config: {
              group: "standard-personal",
              access: { type: "api-key", apiKey: "provider-key" },
              api: { type: "openai-chat-completions", baseUrl: "https://example.com/v1" },
              personalModelIds: ["model-a"],
            },
          },
        ],
      }),
      models: ModelConfigRules.empty(),
      providerOrder: ["custom"],
      defaultModelSelection: { providerId: "custom", modelId: "model-a" },
    }));
    const source = createProviderProvisioningSource({
      personalRepository: repository,
      personalConfigFilePath: join(root, "provider_config.json"),
    });

    const snapshot = await source.read("sync-source");
    expect(snapshot).toEqual({
      schemaVersion: 3,
      syncId: "sync-source",
      personalConfig: encodeProviderConfigFile(await repository.read()).config,
    });
    expect(snapshot.personalConfig.defaultModelSelection).toEqual({
      providerId: "custom",
      modelId: "model-a",
    });
  });
});

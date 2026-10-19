/* 官方 MCP 鉴权（zcode_official）已下线：Plugin loader 遇到 `auth` 声明必须禁用该 MCP，
   不能静默降级为匿名请求。 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createNodePluginAdapter } from "../src/plugins/index.js";

const PLUGIN_NAME = "official-mcp-plugin";
const MCP_KEY = "fake-official-search";
const RUNTIME_NAME = `plugin:${PLUGIN_NAME}:${MCP_KEY}`;

interface DiscoverOutcome {
  diagnostics: Array<{ code: string; message: string }>;
  mcpServers: Record<string, Record<string, unknown>>;
}

async function discoverWithMcpServer(server: Record<string, unknown>): Promise<{
  cleanup: () => Promise<void>;
  outcome: DiscoverOutcome;
}> {
  const dir = await mkdtemp(join(tmpdir(), "zcode-official-mcp-plugin-"));
  const pluginRoot = join(dir, PLUGIN_NAME);
  await mkdir(join(pluginRoot, ".zcode-plugin"), { recursive: true });
  await writeFile(
    join(pluginRoot, ".zcode-plugin", "plugin.json"),
    JSON.stringify({ name: PLUGIN_NAME }),
  );
  await writeFile(
    join(pluginRoot, ".mcp.json"),
    JSON.stringify({ mcpServers: { [MCP_KEY]: server } }),
  );

  const outcome = (await createNodePluginAdapter({
    storageRoot: join(dir, "plugins"),
  }).discoverPlugins({
    config: { dirs: [pluginRoot], enabled: true, enabledPlugins: {}, options: {} },
    env: {},
    storageRoot: join(dir, "plugins"),
    workingDirectory: dir,
  })) as unknown as DiscoverOutcome;

  return { cleanup: () => rm(dir, { force: true, recursive: true }), outcome };
}

function expectDisabled(outcome: DiscoverOutcome): void {
  expect(outcome.mcpServers[RUNTIME_NAME]).toBeUndefined();
  expect(outcome.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
    "plugin_mcp_server_disabled",
  );
}

describe("plugin mcp auth declaration", () => {
  it.each([
    ["http", { type: "http", url: "https://mcp.zcode.example/mcp" }],
    ["stdio", { type: "stdio", command: "node" }],
    ["sse", { type: "sse", url: "https://mcp.zcode.example/sse" }],
  ])("disables a %s server that declares auth", async (_label, server) => {
    const { cleanup, outcome } = await discoverWithMcpServer({
      ...server,
      auth: { provider: "jwt_token", type: "zcode_official" },
    });
    try {
      expectDisabled(outcome);
    } finally {
      await cleanup();
    }
  });
});

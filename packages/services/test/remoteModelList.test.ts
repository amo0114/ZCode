import type { ApiClient } from "@zcode/shared";
import { describe, expect, it, vi } from "vitest";
import { listRemoteModels } from "../src/model-provider/remoteModelList.js";

function createApiClient(response: Response) {
  const request = vi.fn<ApiClient["request"]>(async () => response);
  return { apiClient: { request } satisfies ApiClient, request };
}

describe("listRemoteModels", () => {
  it("OpenAI 兼容格式请求 {baseUrl}/models 并用 Bearer 鉴权，结果去重", async () => {
    const { apiClient, request } = createApiClient(
      Response.json({ data: [{ id: "gpt-4o" }, { id: "gpt-4o" }, { id: "o3" }, { foo: 1 }] }),
    );
    await expect(
      listRemoteModels(apiClient, {
        apiType: "openai-chat-completions",
        baseUrl: "https://api.example.com/v1/",
        apiKey: "sk-test",
      }),
    ).resolves.toEqual(["gpt-4o", "o3"]);
    expect(request).toHaveBeenCalledWith(
      "https://api.example.com/v1/models",
      expect.objectContaining({ headers: { Authorization: "Bearer sk-test" } }),
    );
  });

  it("Anthropic 格式补齐 /v1 并使用 x-api-key", async () => {
    const { apiClient, request } = createApiClient(
      Response.json({ data: [{ id: "claude-sonnet-5" }] }),
    );
    await listRemoteModels(apiClient, {
      apiType: "anthropic-messages",
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-ant",
    });
    expect(request).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/models",
      expect.objectContaining({
        headers: { "x-api-key": "sk-ant", "anthropic-version": "2023-06-01" },
      }),
    );
  });

  it("非 2xx 或缺少 data 时抛错", async () => {
    const input = {
      apiType: "openai-responses",
      baseUrl: "https://x.test/v1",
      apiKey: "k",
    } as const;
    await expect(
      listRemoteModels(createApiClient(new Response("", { status: 401 })).apiClient, input),
    ).rejects.toThrow("HTTP 401");
    await expect(
      listRemoteModels(createApiClient(Response.json({ models: [] })).apiClient, input),
    ).rejects.toThrow("no model list");
  });
});

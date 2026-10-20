import type { ApiClient } from "@zcode/shared";
import { describe, expect, it, vi } from "vitest";
import { probeNativeToolSearch } from "../src/model-provider/nativeToolSearchProbe.js";

function createApiClient(response: Response) {
  const request = vi.fn<ApiClient["request"]>(async () => response);
  return { apiClient: { request } satisfies ApiClient, request };
}

const input = { baseUrl: "https://relay.example.com/", apiKey: "sk-ant", modelId: "claude-test" };

describe("probeNativeToolSearch", () => {
  it("以原生模式的请求形态探测：beta 头 + 常驻 ToolSearch + defer_loading 工具", async () => {
    const { apiClient, request } = createApiClient(Response.json({ id: "msg_1" }));
    await expect(probeNativeToolSearch(apiClient, input)).resolves.toEqual({ supported: true });

    const [url, init] = request.mock.calls[0]!;
    expect(url).toBe("https://relay.example.com/v1/messages");
    expect(init?.headers).toMatchObject({
      "x-api-key": "sk-ant",
      "anthropic-beta": "advanced-tool-use-2025-11-20",
    });
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ model: "claude-test", max_tokens: 1 });
    expect(body.tools.map((tool: { name: string; defer_loading?: boolean }) => tool)).toEqual([
      expect.not.objectContaining({ defer_loading: true }),
      expect.objectContaining({ defer_loading: true }),
    ]);
  });

  it("4xx 参数错误判为不支持并带回错误摘要", async () => {
    const { apiClient } = createApiClient(
      new Response('{"error":{"message":"tools.1.defer_loading: Extra inputs"}}', { status: 400 }),
    );
    await expect(probeNativeToolSearch(apiClient, input)).resolves.toEqual({
      supported: false,
      detail: '{"error":{"message":"tools.1.defer_loading: Extra inputs"}}',
    });
  });

  it("鉴权失败等其他错误直接抛出，不误判为不支持", async () => {
    const { apiClient } = createApiClient(new Response("unauthorized", { status: 401 }));
    await expect(probeNativeToolSearch(apiClient, input)).rejects.toThrow("HTTP 401");
  });
});

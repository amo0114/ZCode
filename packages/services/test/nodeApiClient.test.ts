import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@zcode/shared";
import { createNodeApiClient } from "../src/providers/api/nodeApiClient.js";

describe("nodeApiClient", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("会给请求自动补 x-request-id", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const client = createNodeApiClient({ fetchImpl });

    await client.request("https://example.com/oauth/token", {
      method: "POST",
    });

    const headers = new Headers(fetchImpl.mock.calls[0]?.[1]?.headers);
    expect(headers.get("x-request-id")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("保留调用方显式传入的 x-request-id", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const client = createNodeApiClient({ fetchImpl });

    await client.request("https://example.com/oauth/token", {
      method: "POST",
      headers: {
        "X-Request-Id": "caller-request-id",
      },
    });

    const headers = new Headers(fetchImpl.mock.calls[0]?.[1]?.headers);
    expect(headers.get("x-request-id")).toBe("caller-request-id");
  });

  it("会把 timeoutMs 转成统一的 ApiError", async () => {
    vi.useFakeTimers();

    const fetchImpl = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener(
          "abort",
          () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          },
          { once: true },
        );
      });
    });

    const client = createNodeApiClient({ fetchImpl });
    const requestPromise = client.request("https://example.com/oauth/token", {
      method: "POST",
      timeoutMs: 10,
    });
    const expectation = expect(requestPromise).rejects.toEqual(
      expect.objectContaining<ApiError>({
        name: "ApiError",
        method: "POST",
        status: undefined,
        url: "https://example.com/oauth/token",
      }),
    );

    await vi.advanceTimersByTimeAsync(10);

    await expectation;
  });

  it("外部主动 abort 时不会误报成 timeout", async () => {
    const fetchImpl = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          },
          { once: true },
        );
      });
    });

    const client = createNodeApiClient({ fetchImpl });
    const controller = new AbortController();
    const requestPromise = client.request("https://example.com/oauth/token", {
      method: "POST",
      timeoutMs: 100,
      signal: controller.signal,
    });

    controller.abort();

    await expect(requestPromise).rejects.toMatchObject<ApiError>({
      name: "ApiError",
      method: "POST",
      status: undefined,
      url: "https://example.com/oauth/token",
      message: "The operation was aborted.",
    });
  });
});

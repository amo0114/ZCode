import type { IBroadcastService } from "@zcode/services";
import { beforeEach, describe, expect, it } from "vitest";
import { createZCodeStore } from "@/store/index.js";

const localStorageState = new Map<string, string>();

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => localStorageState.get(key) ?? null,
    setItem: (key: string, value: string) => {
      localStorageState.set(key, value);
    },
    removeItem: (key: string) => {
      localStorageState.delete(key);
    },
    clear: () => {
      localStorageState.clear();
    },
  },
});

Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: {
    documentElement: {
      classList: {
        contains: () => false,
        toggle: () => {},
      },
    },
  },
});

const mockBroadcastService: IBroadcastService = {
  send: async () => {},
  onMessage: () => ({ dispose: () => {} }),
};

describe("createZCodeStore global state", () => {
  beforeEach(() => {
    localStorageState.clear();
  });

  it("默认不处于 OAuth 启动恢复中", () => {
    const store = createZCodeStore(mockBroadcastService);

    expect(store.getState().isRestoringOAuthSession).toBe(false);
  });

  it("支持在首次渲染前把 OAuth 恢复态初始化为 pending", () => {
    const store = createZCodeStore(mockBroadcastService, {
      initialIsRestoringOAuthSession: true,
    });

    expect(store.getState().isRestoringOAuthSession).toBe(true);
  });

  it("性能模式默认关闭，并持久化用户选择", () => {
    const store = createZCodeStore(mockBroadcastService);

    expect(store.getState().performanceMode).toBe(false);

    store.getState().setPerformanceMode(true);

    expect(store.getState().performanceMode).toBe(true);
    expect(localStorageState.get("zcode-performance-mode")).toBe("true");
    expect(
      createZCodeStore(mockBroadcastService).getState().performanceMode,
    ).toBe(true);
  });
});

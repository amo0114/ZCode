import { describe, expect, it } from "vitest";
import { resolveToolSearchCapability } from "../src/model/tool-search.js";

describe("ToolSearch provider capability", () => {
  it("只有 Anthropic Messages 支持原生协议，且 auto 不默认启用原生", () => {
    expect(resolveToolSearchCapability("anthropic-messages")).toEqual({
      protocolSupported: true,
      defaultEnabled: false,
    });
    expect(resolveToolSearchCapability("openai-chat-completions")).toEqual({
      protocolSupported: false,
      defaultEnabled: false,
    });
  });
});

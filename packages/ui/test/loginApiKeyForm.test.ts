import { describe, expect, it } from "vitest";
import {
  buildLoginApiKeyDefaultModelPreferenceFromSelection,
  resolveHydratedLoginApiKeyValue,
  shouldShowLoginApiKeyLink,
} from "@/login/LoginApiKeyForm.helpers.js";
import { encodeCustomModelValue } from "@/lib/zcodeCustomModelValue.js";

describe("LoginApiKeyForm provider update helpers", () => {
  it("只有输入框为空且 provider 有 URL 时展示获取 API key 链接", () => {
    expect(shouldShowLoginApiKeyLink("", "https://z.ai/manage-apikey/apikey-list")).toBe(true);
    expect(shouldShowLoginApiKeyLink(" sk-login ", "https://z.ai/manage-apikey/apikey-list")).toBe(
      false,
    );
    expect(shouldShowLoginApiKeyLink("", undefined)).toBe(false);
  });

  it("新 Provider Runtime 从 Selection View 选择 API key 登录后的默认模型", () => {
    expect(
      buildLoginApiKeyDefaultModelPreferenceFromSelection(
        {
          revision: 3,
          providers: [
            {
              providerId: "bigmodel-api",
              config: {
                kind: "api",
                models: ["glm-5.3", "glm-5.2"],
              },
              models: [
                { modelId: "glm-5.3", config: {} },
                { modelId: "glm-5.2", config: {} },
              ],
            },
          ],
        },
        "bigmodel-api",
      ),
    ).toBe(encodeCustomModelValue("bigmodel-api", "glm-5.3"));
  });

  it("已保存 API key 只在用户尚未编辑输入框时回填", () => {
    expect(
      resolveHydratedLoginApiKeyValue({
        savedApiKey: " sk-saved ",
        userEdited: false,
      }),
    ).toBe("sk-saved");
    expect(
      resolveHydratedLoginApiKeyValue({
        savedApiKey: "sk-saved",
        userEdited: true,
      }),
    ).toBeNull();
  });
});

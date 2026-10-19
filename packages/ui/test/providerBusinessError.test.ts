import { describe, expect, it } from "vitest";
import {
  getProviderBusinessErrorMessageId,
  isProviderBusinessErrorCode,
} from "@/lib/providerBusinessError.js";

describe("providerBusinessError", () => {
  it("recognizes provider business codes for localized banners", () => {
    expect(isProviderBusinessErrorCode("3007")).toBe(true);
    expect(getProviderBusinessErrorMessageId("1005")).toBe(
      "zcode.error.providerBusiness.1005",
    );
    expect(isProviderBusinessErrorCode("3010")).toBe(true);
    expect(getProviderBusinessErrorMessageId("3010")).toBe(
      "zcode.error.providerBusiness.3010",
    );
    expect(isProviderBusinessErrorCode("invalid_model_request")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  CREDENTIAL_DECRYPT_ERROR_CODE,
  CREDENTIAL_DECRYPT_ERROR_PREFIX,
  isCredentialDecryptError,
} from "../src/oauth.js";

describe("oauth errors", () => {
  it("recognizes credential decrypt errors by stable code", () => {
    expect(
      isCredentialDecryptError({
        code: CREDENTIAL_DECRYPT_ERROR_CODE,
        message: "serialized error without localized prefix",
      }),
    ).toBe(true);
  });

  it("keeps legacy message fallback only when code is missing", () => {
    expect(
      isCredentialDecryptError({
        message: `${CREDENTIAL_DECRYPT_ERROR_PREFIX}密钥不匹配或密文已损坏`,
      }),
    ).toBe(true);
  });

  it("does not let another error code match by localized message prefix", () => {
    expect(
      isCredentialDecryptError({
        code: "OTHER_ERROR",
        message: `${CREDENTIAL_DECRYPT_ERROR_PREFIX}业务错误`,
      }),
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import {
  getNewPasswordError,
  isInvalidPasswordResetLink,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "./password-reset";

describe("password reset policy", () => {
  it("requires the configured password length", () => {
    expect(
      getNewPasswordError("a".repeat(PASSWORD_MIN_LENGTH - 1), "ignored")
    ).toBe(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
    expect(
      getNewPasswordError(
        "a".repeat(PASSWORD_MAX_LENGTH + 1),
        "a".repeat(PASSWORD_MAX_LENGTH + 1)
      )
    ).toBe(`Use no more than ${PASSWORD_MAX_LENGTH} characters.`);
  });

  it("requires matching passwords", () => {
    expect(getNewPasswordError("password", "different")).toBe(
      "The passwords do not match."
    );
    expect(getNewPasswordError("password", "password")).toBeNull();
  });

  it("only accepts callback links with a token and no error", () => {
    expect(isInvalidPasswordResetLink({ token: "valid-token" })).toBe(false);
    expect(isInvalidPasswordResetLink({})).toBe(true);
    expect(
      isInvalidPasswordResetLink({
        token: "expired-token",
        error: "INVALID_TOKEN",
      })
    ).toBe(true);
  });
});

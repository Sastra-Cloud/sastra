import { describe, expect, it } from "vitest";

import { validateMailboxInput } from "./mailbox-input";

describe("mailbox form", () => {
  it("accepts an address and a 16-letter app password with Google's spaces", () => {
    expect(validateMailboxInput({ mailbox: " Publishing@Example.org ", appPassword: "abcd efgh ijkl mnop" })).toEqual({ ok: true, mailbox: "publishing@example.org" });
  });
  it("says what is wrong with the address or the password", () => {
    const badAddress = validateMailboxInput({ mailbox: "publishing", appPassword: "abcdefghijklmnop" });
    expect(badAddress.ok || badAddress.fieldErrors.mailbox).toBeTruthy();
    const badPassword = validateMailboxInput({ mailbox: "a@b.org", appPassword: "hunter2" });
    expect(badPassword).toMatchObject({ ok: false, fieldErrors: { appPassword: ["An app password is 16 letters. Copy it again from your Google account."] } });
  });
});

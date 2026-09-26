import { describe, expect, it } from "vitest";

import { checkStorageAvailable, formatBytes } from "./storage";

const GB = 1024 ** 3;

describe("hosted file space", () => {
  it("has no limit when the plan sets none", () => {
    expect(checkStorageAvailable({ usedBytes: 500 * GB, limitBytes: null }, GB, null)).toEqual({ ok: true });
  });

  it("allows a file that fits exactly and refuses one that does not, saying what to do", () => {
    expect(checkStorageAvailable({ usedBytes: 19 * GB, limitBytes: 20 * GB }, GB, null)).toEqual({ ok: true });
    const full = checkStorageAvailable({ usedBytes: 19.5 * GB, limitBytes: 20 * GB }, GB, "https://account.example");
    expect(full).toEqual({
      ok: false,
      error: "Your workspace is out of file space. It uses 20 GB of 20 GB. Delete files you no longer need, or get more space at https://account.example.",
    });
  });

  it("formats sizes plainly", () => {
    expect(formatBytes(3.24 * GB)).toBe("3.2 GB");
    expect(formatBytes(20 * GB)).toBe("20 GB");
    expect(formatBytes(12.6 * GB)).toBe("13 GB");
    expect(formatBytes(450 * 1024 ** 2)).toBe("450 MB");
    expect(formatBytes(2048)).toBe("2 KB");
  });
});

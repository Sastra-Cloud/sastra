import { describe, expect, it } from "vitest";

import { cleanVersion, sourceRepositoryUrl, sourceUrlFor } from "./source-url";

const repo = "https://github.com/example/sastra";

describe("sourceUrlFor", () => {
  it("prefers the exact commit the image was built from", () => {
    expect(sourceUrlFor({ version: "v1.2.0", revision: "abc123", taggedRelease: true }, repo)).toBe(
      `${repo}/tree/abc123`
    );
  });

  it("falls back to the release tag, then the repository", () => {
    expect(sourceUrlFor({ version: "v1.2.0", revision: null, taggedRelease: true }, repo)).toBe(
      `${repo}/releases/tag/v1.2.0`
    );
    expect(sourceUrlFor({ version: "0.1.0", revision: null, taggedRelease: false }, repo)).toBe(repo);
  });

  it("lets a fork point the link at its own code", () => {
    expect(sourceRepositoryUrl({ SASTRA_SOURCE_REPOSITORY_URL: "https://git.example.org/team/sastra/" })).toBe(
      "https://git.example.org/team/sastra"
    );
    expect(sourceRepositoryUrl({})).toBe("https://github.com/Sastra-Cloud/sastra");
    expect(cleanVersion(" V2.0.1 ")).toBe("2.0.1");
    expect(cleanVersion("")).toBeNull();
  });
});

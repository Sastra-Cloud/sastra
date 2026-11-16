import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getAccessToken = vi.fn();
const limit = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth/guards", () => ({ requireUser: async () => ({ user: { id: "user-1" } }) }));
vi.mock("@/lib/auth/auth", () => ({ auth: { api: { getAccessToken } } }));
vi.mock("@/lib/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit }) }) }) }) },
}));
vi.mock("./access", () => ({ assertTaskAccess: vi.fn(), taskEditPredicate: vi.fn(), withTaskAccess: vi.fn() }));
vi.mock("./create", () => ({ revalidateForTask: vi.fn() }));

const { getDriveAttachContext, getDriveOAuthToken } = await import("./drive-actions");

describe("Google Drive authorization", () => {
  beforeEach(() => {
    getAccessToken.mockReset();
    limit.mockReset();
    vi.stubEnv("GOOGLE_PICKER_API_KEY", "test-key");
    vi.stubEnv("GOOGLE_SHARED_DRIVE_ID", "test-drive");
    vi.stubEnv("GOOGLE_CLIENT_ID", "123-test.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([
    "openid,https://www.googleapis.com/auth/drive.file",
    "openid https://www.googleapis.com/auth/drive",
  ])("opens Drive with the authorized local Google account (%s)", async (scope) => {
    limit.mockResolvedValue([{ id: "local-account-1", scope }]);
    getAccessToken.mockResolvedValue({ accessToken: "token" });
    await expect(getDriveAttachContext()).resolves.toMatchObject({ configured: true, connected: true });
    await expect(getDriveOAuthToken()).resolves.toBe("token");
    expect(getAccessToken.mock.calls[0][0].body).toEqual({ accountId: "local-account-1" });
  });

  it("returns null without a linked Google account", async () => {
    limit.mockResolvedValue([]);
    await expect(getDriveAttachContext()).resolves.toMatchObject({ configured: true, connected: false });
    await expect(getDriveOAuthToken()).resolves.toBeNull();
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it("offers connection again when Google sign-in succeeded without Drive consent", async () => {
    limit.mockResolvedValue([{
      id: "local-account-1",
      scope: "https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/userinfo.profile,openid",
    }]);
    await expect(getDriveAttachContext()).resolves.toMatchObject({ configured: true, connected: false });
    await expect(getDriveOAuthToken()).resolves.toBeNull();
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it("returns the reconnect signal when Google token refresh fails", async () => {
    limit.mockResolvedValue([{ id: "local-account-1", scope: "https://www.googleapis.com/auth/drive.file" }]);
    getAccessToken.mockRejectedValue(new Error("Google authorization expired"));
    await expect(getDriveOAuthToken()).resolves.toBeNull();
  });

  it("does not send an expired, unrefreshable token to the picker", async () => {
    limit.mockResolvedValue([{ id: "local-account-1", scope: "https://www.googleapis.com/auth/drive.file" }]);
    getAccessToken.mockResolvedValue({ accessToken: "expired-token", accessTokenExpiresAt: new Date(0) });
    await expect(getDriveOAuthToken()).resolves.toBeNull();
  });
});

import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), canAccessFile: vi.fn(), presignGet: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/chat/access", () => ({ canAccessFile: mocks.canAccessFile }));
vi.mock("@/lib/db", () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: mocks.limit }) }) }) } }));
vi.mock("@/lib/r2", () => ({ presignGet: mocks.presignGet, getObjectBuffer: vi.fn() }));
vi.mock("@/lib/ai/usage", () => ({ recordR2Operation: async () => {} }));
vi.mock("@/lib/auth/assurance", () => ({ isAdminAssured: vi.fn() }));

import { GET } from "@/app/api/files/[id]/download/route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "viewer", isActive: true } });
  mocks.limit.mockResolvedValue([{ id: "video", status: "ready", purpose: "workspace_attachment", mimeType: "video/mp4", r2Key: "private/video.mp4", originalName: "clip.mp4" }]);
  mocks.presignGet.mockResolvedValue("https://storage.test/private-video");
});

it("requires conversation file access before issuing a longer-lived playback URL", async () => {
  const request = new Request("http://localhost/api/files/video/download?inline=1");
  mocks.canAccessFile.mockResolvedValue(false);
  expect((await GET(request, { params: Promise.resolve({ id: "video" }) })).status).toBe(404);
  expect(mocks.presignGet).not.toHaveBeenCalled();

  mocks.canAccessFile.mockResolvedValue(true);
  const response = await GET(request, { params: Promise.resolve({ id: "video" }) });
  expect(response.status).toBe(307);
  expect(mocks.presignGet).toHaveBeenCalledWith("private/video.mp4", undefined, 3600);
  expect(response.headers.get("Cache-Control")).toContain("private");
});

it("refreshes private audio access without caching an expiring redirect", async () => {
  mocks.limit.mockResolvedValue([{ id: "voice", status: "ready", purpose: "workspace_attachment", mimeType: "audio/webm;codecs=opus", r2Key: "private/voice.webm", originalName: "voice.webm" }]);
  mocks.canAccessFile.mockResolvedValue(true);
  const response = await GET(new Request("http://localhost/api/files/voice/download?inline=1&voiceAttempt=2"), { params: Promise.resolve({ id: "voice" }) });
  expect(mocks.presignGet).toHaveBeenCalledWith("private/voice.webm", undefined, 3600);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});

import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), access: vi.fn(), execute: vi.fn(), preview: vi.fn(), image: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ getSession: mocks.session }));
vi.mock("@/lib/chat/access", () => ({ canAccessMessage: mocks.access }));
vi.mock("@/lib/chat/link-preview", () => ({ getLinkPreview: mocks.preview, getLinkPreviewImage: mocks.image }));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(mocks.execute) };
});
import { GET } from "@/app/api/chat/messages/[messageId]/link-preview/route";

const id = "00000000-0000-4000-8000-000000000001";
function read(extra = "", url = "https://example.org/") {
  return GET(new Request(`https://sastra.example/api/chat/messages/${id}/link-preview?url=${encodeURIComponent(url)}${extra}`), { params: Promise.resolve({ messageId: id }) });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "viewer" } });
  mocks.access.mockResolvedValue(true);
  mocks.execute.mockResolvedValue({ rows: [["See https://example.org/"]] });
  mocks.preview.mockResolvedValue({ title: "Article", description: "Details", image: "https://cdn.example.org/image" });
  mocks.image.mockResolvedValue(Buffer.from("safe-image"));
});

it("requires a session and conversation membership for both metadata and thumbnails", async () => {
  mocks.session.mockResolvedValue(null);
  expect((await read()).status).toBe(401);
  expect(mocks.access).not.toHaveBeenCalled();
  mocks.session.mockResolvedValue({ user: { id: "viewer" } });
  mocks.access.mockResolvedValue(false);
  expect((await read()).status).toBe(404);
  expect((await read("&image=1")).status).toBe(404);
  expect(mocks.preview).not.toHaveBeenCalled();
  expect(mocks.image).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
});

it("only fetches the current message's first link and refuses stale edits and deleted messages", async () => {
  expect((await read("", "https://other.example.org/")).status).toBe(404);
  mocks.execute.mockResolvedValue({ rows: [] });
  expect((await read()).status).toBe(404);
  expect(mocks.preview).not.toHaveBeenCalled();
});

it("returns private metadata and proxied thumbnails without exposing the remote image URL", async () => {
  const response = await read();
  expect(await response.json()).toEqual({ preview: { title: "Article", description: "Details", hasImage: true } });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const image = await read("&image=1");
  expect(image.headers.get("content-type")).toBe("image/webp");
  expect(await image.text()).toBe("safe-image");
  expect(mocks.image).toHaveBeenCalledWith("https://cdn.example.org/image");
});

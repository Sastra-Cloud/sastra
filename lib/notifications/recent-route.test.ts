import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), unread: vi.fn(), rows: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ getSession: mocks.session }));
vi.mock("@/lib/notifications/queries", () => ({ getUnreadCount: mocks.unread, listBellNotifications: mocks.rows, notificationProject: () => "Project" }));
import { GET } from "@/app/api/notifications/recent/route";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "signed-in-user" } });
  mocks.unread.mockResolvedValue(3);
  mocks.rows.mockResolvedValue([{ id: "notification", title: "Review", body: "Private body", data: {} }]);
});

it("returns only the authenticated person's count for closed-bell polls without reading bodies", async () => {
  const response = await GET(new Request("http://localhost/api/notifications/recent?summary=1&userId=someone-else"));
  expect(await response.json()).toEqual({ unread: 3 });
  expect(mocks.unread).toHaveBeenCalledExactlyOnceWith("signed-in-user");
  expect(mocks.rows).not.toHaveBeenCalled();
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

it("loads private details only after authentication and does not reuse them after sign-out", async () => {
  const request = new Request("http://localhost/api/notifications/recent");
  const response = await GET(request);
  expect(await response.json()).toMatchObject({ unread: 3, items: [{ id: "notification", body: "Private body", project: "Project" }] });
  expect(mocks.rows).toHaveBeenCalledExactlyOnceWith("signed-in-user", 15);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  mocks.rows.mockClear(); mocks.unread.mockClear();
  mocks.session.mockResolvedValue(null);
  expect((await GET(request)).status).toBe(401);
  expect((await GET(new Request(request.url + "?summary=1"))).status).toBe(401);
  expect(mocks.rows).not.toHaveBeenCalled();
  expect(mocks.unread).not.toHaveBeenCalled();
});

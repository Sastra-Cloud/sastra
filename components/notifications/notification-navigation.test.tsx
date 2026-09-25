import { expect, it, vi } from "vitest";
import type { ReactElement } from "react";
const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), mark: vi.fn(), error: vi.fn(), state: vi.fn(), set: vi.fn() }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useState: mocks.state, useEffect: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
vi.mock("@/lib/notifications/actions", () => ({ markNotificationRead: mocks.mark, markAllNotificationsRead: vi.fn() }));
vi.mock("@/lib/push/client", () => ({ setAppBadge: vi.fn() }));
import { NotificationBell } from "./notification-bell";
import { NotificationsList } from "./notifications-list";
const item = { id: "notification", type: "invoice_ready", title: "Review MoU funding", body: null, project: null, link: "/agreements/review/example", readAt: null, createdAt: new Date().toISOString() };
function buttons(node: unknown): ReactElement<{ onClick: () => Promise<void> }>[] {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as ReactElement<{ children?: unknown; onClick: () => Promise<void> }>;
  return [...(el.type === "button" ? [el] : []), ...buttons(el.props.children)];
}
for (const surface of ["bell", "list"]) {
  it(`${surface} navigates before read status settles and retains rollback on failure`, async () => {
    vi.clearAllMocks();
    let fail!: (error: Error) => void;
    mocks.mark.mockReturnValue(new Promise((_, reject) => { fail = reject; }));
    const states = surface === "bell" ? [true, 1, [item]] : [[item]];
    mocks.state.mockImplementation(() => [states.shift(), mocks.set]);
    const tree = surface === "bell" ? NotificationBell() : NotificationsList({ initial: [item] });
    const pending = buttons(tree).at(-1)!.props.onClick();
    expect(mocks.push).toHaveBeenCalledWith(item.link);
    expect(mocks.refresh).not.toHaveBeenCalled();
    if (surface === "bell") expect(mocks.set).toHaveBeenCalledWith(false);
    fail(new Error("Read status unavailable"));
    await pending;
    expect(mocks.error).toHaveBeenCalledWith("Could not mark the notification as read.");
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });
}

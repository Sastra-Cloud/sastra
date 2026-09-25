import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/guards";
import {
  getUnreadCount,
  listBellNotifications,
  notificationProject,
} from "@/lib/notifications/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [unread, rows] = await Promise.all([
    getUnreadCount(session.user.id),
    listBellNotifications(session.user.id, 15),
  ]);
  const items = rows.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    project: notificationProject(n.data),
    link: n.link,
    readAt: n.readAt,
    createdAt: n.createdAt,
  }));
  return NextResponse.json({ unread, items });
}

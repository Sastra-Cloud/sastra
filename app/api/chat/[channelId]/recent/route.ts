import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/guards";
import { canAccessChannel } from "@/lib/chat/access";
import { listChannelPins } from "@/lib/chat/pins";
import { getRecentMessages } from "@/lib/chat/queries";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { channelId } = await params;
  if (!(await canAccessChannel(channelId, session.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [messages, pins] = await Promise.all([
    getRecentMessages(channelId, session.user.id),
    listChannelPins(channelId, session.user.id),
  ]);
  return NextResponse.json({ messages, pins });
}

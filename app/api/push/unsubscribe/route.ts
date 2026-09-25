import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/guards";
import { removeSubscription } from "@/lib/notifications/push";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (!body?.endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }
  await removeSubscription(body.endpoint, session.user.id);
  return NextResponse.json({ ok: true });
}

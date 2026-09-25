import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/guards";
import { saveSubscription } from "@/lib/notifications/push";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }
  await saveSubscription(
    session.user.id,
    { endpoint: body.endpoint, keys: { p256dh: body.keys.p256dh, auth: body.keys.auth } },
    request.headers.get("user-agent") ?? undefined
  );
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/guards";
import { saveSubscription } from "@/lib/notifications/push";
import { pushSubscriptionSchema } from "@/lib/push/subscription";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = pushSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }
  await saveSubscription(
    session.user.id,
    parsed.data,
    request.headers.get("user-agent") ?? undefined
  );
  return NextResponse.json({ ok: true });
}

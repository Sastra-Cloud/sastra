import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/guards";
import { recordHeartbeat } from "@/lib/presence/queries";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Body may be JSON (interval beat) or a sendBeacon Blob (page hide); default to
  // visible if it can't be parsed.
  let visible = true;
  try {
    const body = await request.json();
    if (typeof body?.visible === "boolean") visible = body.visible;
  } catch {
    // keep default
  }

  await recordHeartbeat(session.user.id, visible);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/guards";
import { listActivePresence } from "@/lib/presence/queries";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const statuses = await listActivePresence();
  return NextResponse.json({ statuses });
}

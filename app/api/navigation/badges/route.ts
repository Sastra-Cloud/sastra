import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/guards";
import { getNavigationBadgeCounts } from "@/lib/navigation/badge-queries";
import { getWorkspaceSettings } from "@/lib/workspace/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const workspace = await getWorkspaceSettings();
  const counts = await getNavigationBadgeCounts(session.user, workspace.timezone);
  return NextResponse.json(counts, { headers: { "Cache-Control": "private, no-store" } });
}

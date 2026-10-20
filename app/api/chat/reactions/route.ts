import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/guards";
import { getFrequentReactions } from "@/lib/chat/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const emojis = await getFrequentReactions(session.user.id);
  return NextResponse.json({ emojis }, { headers: { "Cache-Control": "private, no-store" } });
}

import { NextResponse } from "next/server";

import { vapidPublicKeyFromEnv } from "@/lib/push/keys";

// The Web Push public key, read at request time so prebuilt images can enable
// push through environment variables. The key is public by design.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { publicKey: vapidPublicKeyFromEnv() || null },
    { headers: { "Cache-Control": "no-store" } }
  );
}

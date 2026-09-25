import { NextResponse } from "next/server";

import { unsubscribeNotificationEmail } from "@/lib/notifications/email-queue";

// RFC 8058 one-click unsubscribe (POST only — GET prefetchers must not mutate).
export async function POST(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const rawCategory = url.searchParams.get("category");
  const category = rawCategory === "all"
    ? "all"
    : rawCategory === "standup"
      ? "standup"
      : "workflow";
  if (token) {
    await unsubscribeNotificationEmail(token, category);
  }
  return new NextResponse("You have been unsubscribed.", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

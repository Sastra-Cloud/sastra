import { getSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { createChannel } from "@/lib/chat/actions";
import { hasTrustedRequestOrigin } from "@/lib/security/request-origin";

/** Stable URL for long-lived PWA windows; no build-specific Server Action ID. */
export async function POST(request: Request) {
  if (!request.headers.get("origin") || !hasTrustedRequestOrigin(request)) {
    return Response.json({ error: "Refresh the app, then try again." }, { status: 403 });
  }
  const session = await getSession();
  if (!session?.user.isActive) {
    return Response.json({ error: "Sign in again to create a channel." }, { status: 401 });
  }
  if (!can(session.user, "chat.createChannel")) {
    return Response.json({ error: "Ask a manager to create this channel." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "Check the channel details and try again." }, { status: 400 });
  }
  const raw = await request.text();
  if (raw.length > 64_000) return Response.json({ error: "Too many channel details." }, { status: 413 });
  let body;
  try { body = JSON.parse(raw); } catch { /* Invalid JSON. */ }
  if (!body || typeof body.name !== "string" || !Array.isArray(body.memberIds) ||
      body.memberIds.length > 200 || !body.memberIds.every((id: unknown) => typeof id === "string")) {
    return Response.json({ error: "Check the channel details and try again." }, { status: 400 });
  }
  const data = new FormData();
  data.set("name", body.name);
  for (const id of body.memberIds) data.append("memberIds", id);
  // Keep the existing role gate, validation, active-member filtering, and
  // transaction together. Never retry here: the response may be lost after commit.
  try {
    const result = await createChannel({}, data);
    return Response.json(result, {
      status: result.ok ? 200 : 400,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Could not confirm creation. Check the channel list before trying again." }, { status: 503 });
  }
}

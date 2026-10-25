import { isAdminRole } from "@/lib/auth/policy";
import { getSession } from "@/lib/auth/guards";
import { finishPairing } from "@/lib/lectio/pairing";
import { IntegrationError } from "@/lib/lectio/protocol/contract";
import { errorResponse } from "@/lib/lectio/protocol/signing";
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session || !isAdminRole(session.user)) throw new IntegrationError("forbidden", "Sign in as the administrator who started this connection.", 403);
    const url = new URL(request.url);
    await finishPairing(session.user.id, url.searchParams.get("state") || "", url.searchParams.get("code") || "");
    return new Response(null, { status: 303, headers: { Location: "/settings/lectio", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) { return errorResponse(error); }
}

import { isAdminRole } from "@/lib/auth/policy";
import { getSession } from "@/lib/auth/guards";
import { beginPairing } from "@/lib/lectio/pairing";
import { EVENT_LIMIT, IntegrationError, object, string } from "@/lib/lectio/protocol/contract";
import { errorResponse, readLimitedBody } from "@/lib/lectio/protocol/signing";
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(process.env.BETTER_AUTH_URL || request.url).origin) throw new IntegrationError("forbidden", "Invalid request origin.", 403);
    const session = await getSession();
    if (!session || !isAdminRole(session.user)) throw new IntegrationError("forbidden", "Only a workspace administrator can connect Lectio.", 403);
    const body = object(JSON.parse(Buffer.from(await readLimitedBody(request, EVENT_LIMIT)).toString("utf8")));
    return Response.json(await beginPairing(session.user.id, string(body.origin)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

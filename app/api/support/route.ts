import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/guards";
import {
  supportConfiguration,
  supportRouteSummary,
} from "@/lib/support/config";
import { supportRequest } from "@/lib/support/service";
import { runningVersion } from "@/lib/ops/version";
import { z } from "zod";

export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  if (!supportConfiguration())
    return Response.json(
      { error: "Community support is available from Help." },
      { status: 404 },
    );
  if (req.headers.get("origin") !== req.nextUrl.origin)
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  const session = await getSession();
  if (!session?.user.isActive)
    return Response.json({ error: "Sign in to use support." }, { status: 401 });
  if (Number(req.headers.get("content-length") ?? 0) > 8 * 1024 * 1024)
    return Response.json({ error: "Attachment too large." }, { status: 413 });
  try {
    const raw = await req.text();
    if (raw.length > 8 * 1024 * 1024)
      return Response.json({ error: "Attachment too large." }, { status: 413 });
    const x = JSON.parse(raw);
    z.enum([
      "create",
      "list",
      "get",
      "reply",
      "preferences",
      "upload",
      "download",
    ]).parse(x.op);
    const actor = {
      id: session.user.id,
      email: session.user.email,
      admin: session.user.role === "admin",
    };
    const version = runningVersion();
    const input = {
      ...x,
      actor,
      ...(x.op === "create"
        ? {
            diagnostics: {
              version: version.version,
              revision: version.revision,
              route: supportRouteSummary(
                String(x.diagnostics?.route ?? "/support"),
              ),
              browser: String(x.diagnostics?.browser ?? "").slice(0, 300),
            },
          }
        : {}),
    };
    return Response.json(await supportRequest(input), {
      headers: { "cache-control": "no-store" },
    });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof z.ZodError || e instanceof SyntaxError
            ? "Check the request fields."
            : e instanceof Error
              ? e.message
              : "Support is temporarily unavailable.",
      },
      {
        status: e instanceof z.ZodError || e instanceof SyntaxError ? 400 : 503,
      },
    );
  }
}

import { runningVersion } from "@/lib/ops/version";

// A tiny, cache-busted signal of "which build is the server running". The
// client polls `id` and, when it changes, prompts a refresh — so an open tab
// recovers from a deploy instead of silently hitting a version-skew 404 when it
// invokes a Server Action whose id changed in the new build. `version`,
// `revision`, and `digest` identify the release for support and the AGPL
// source link.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(runningVersion(), {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

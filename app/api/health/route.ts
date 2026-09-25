// Liveness probe for container healthchecks (Coolify/Docker). Public + no DB hit
// so it reflects "the web server is up", not transient DB blips. Returns 200 "OK".
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return new Response("OK", {
    status: 200,
    headers: { "content-type": "text/plain", "cache-control": "no-store" },
  });
}

import { legacyCronRoute } from "@/lib/cron/legacy-route";

// Alias for `POST /api/cron/tick`; kept so existing scheduled tasks keep working.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handle = legacyCronRoute("weekly-digest");

export const POST = handle;
export const GET = handle;

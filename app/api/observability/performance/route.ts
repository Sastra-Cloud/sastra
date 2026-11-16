import { getSession } from "@/lib/auth/guards";
import { logger } from "@/lib/logger";
import {
  createRateLimiter,
  handlePerformanceReport,
  performanceMonitoringEnabled,
} from "@/lib/observability/performance-intake";
import { runningVersion } from "@/lib/ops/version";
import { hasTrustedRequestOrigin } from "@/lib/security/request-origin";

export const dynamic = "force-dynamic";

const allowReport = createRateLimiter({ limit: 30, windowMs: 60_000 });

/** Optional, operator-enabled intake for anonymous browser performance numbers. */
export async function POST(request: Request) {
  return handlePerformanceReport(request, {
    enabled: performanceMonitoringEnabled,
    userId: async () => {
      const session = await getSession();
      return session?.user.isActive ? session.user.id : null;
    },
    trustedOrigin: hasTrustedRequestOrigin,
    allow: allowReport,
    record: (entry) => logger.info("performance.report", entry),
    build: () => runningVersion().id,
  });
}

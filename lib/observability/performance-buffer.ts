import {
  MAX_OBSERVATIONS_PER_REPORT,
  parsePerformanceReport,
  type PerformanceObservation,
} from "./performance-report";

const MAX_QUEUED = 24;
const MAX_REPORTS_PER_PAGE = 6;

/**
 * A small bounded queue between the browser's measurements and the network.
 * Observations beyond the cap are dropped, and each page load sends at most a
 * handful of reports, so a runaway page cannot become a traffic source.
 * Every report is validated with the server's own parser before sending.
 */
export function createReportBuffer(send: (body: string) => void) {
  let queue: PerformanceObservation[] = [];
  let sent = 0;
  return {
    add(observation: PerformanceObservation) {
      if (queue.length >= MAX_QUEUED) return false;
      queue.push(observation);
      return true;
    },
    size: () => queue.length,
    flush() {
      while (queue.length > 0 && sent < MAX_REPORTS_PER_PAGE) {
        const observations = queue.slice(0, MAX_OBSERVATIONS_PER_REPORT);
        queue = queue.slice(observations.length);
        const report = parsePerformanceReport({ version: 1, observations });
        if (!report) continue;
        sent += 1;
        send(JSON.stringify(report));
      }
      // Anything left once the page budget is spent is not sent.
      if (sent >= MAX_REPORTS_PER_PAGE) queue = [];
    },
  };
}

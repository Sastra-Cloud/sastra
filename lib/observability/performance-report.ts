/**
 * What a browser may report about performance, and the only shape the server
 * accepts. Everything here is a closed list or a bounded number: no URLs,
 * identifiers, names, text, or browser entry objects can be expressed.
 */

export const ROUTE_CATEGORIES = [
  "dashboard",
  "projects",
  "project",
  "chat",
  "other",
] as const;
export type RouteCategory = (typeof ROUTE_CATEGORIES)[number];

/** `hard` is a document load; `client` is an in-app route change. */
export const NAVIGATION_KINDS = ["hard", "client"] as const;
export type NavigationKind = (typeof NAVIGATION_KINDS)[number];

export const WEB_VITAL_NAMES = ["TTFB", "FCP", "LCP", "INP", "CLS"] as const;
export type WebVitalName = (typeof WEB_VITAL_NAMES)[number];

/**
 * Useful-work markers, each tied to the one route category where it can occur.
 * `-visible` is when the content first painted; `-ready` is when React has
 * attached the handlers, so the person can act on it.
 */
export const USEFUL_WORK_ROUTES = {
  "dashboard-tasks-visible": "dashboard",
  "dashboard-tasks-ready": "dashboard",
  "chat-messages-visible": "chat",
  "chat-composer-ready": "chat",
} as const satisfies Record<string, RouteCategory>;
export type UsefulWorkName = keyof typeof USEFUL_WORK_ROUTES;
export const USEFUL_WORK_NAMES = Object.keys(USEFUL_WORK_ROUTES) as UsefulWorkName[];

export type MetricName = WebVitalName | UsefulWorkName;
const METRIC_NAMES: readonly string[] = [...WEB_VITAL_NAMES, ...USEFUL_WORK_NAMES];

export type PerformanceObservation = {
  name: MetricName;
  route: RouteCategory;
  navigation: NavigationKind;
  /** Milliseconds, except CLS which is unitless. */
  value: number;
};

export type PerformanceReport = {
  version: 1;
  observations: PerformanceObservation[];
};

export const MAX_OBSERVATIONS_PER_REPORT = 12;
export const MAX_REPORT_BYTES = 2048;
const MAX_MILLISECONDS = 10 * 60 * 1000;
const MAX_CLS = 100;

export function isRouteCategory(value: unknown): value is RouteCategory {
  return typeof value === "string" && (ROUTE_CATEGORIES as readonly string[]).includes(value);
}

/** Maps a path to a fixed category. The path itself is never kept. */
export function routeCategoryForPath(pathname: string): RouteCategory {
  const segments = pathname.split("?")[0].split("#")[0].split("/").filter(Boolean);
  const [first, , third] = segments;
  if (first === "dashboard") return "dashboard";
  if (first === "chat") return "chat";
  if (first === "projects") {
    if (segments.length === 1) return "projects";
    return third === "chat" ? "chat" : "project";
  }
  return "other";
}

/** Attribute delayed vitals to the navigation measured, never the current UI. */
export function observationForWebVital(
  metric: { name: string; value: number; navigationType: string; navigationURL?: string },
  documentRoute: RouteCategory
): PerformanceObservation | null {
  if (!(WEB_VITAL_NAMES as readonly string[]).includes(metric.name)) return null;
  if (!isValidMetricValue(metric.name, metric.value)) return null;
  const navigation = metric.navigationType === "soft-navigation" ? "client" : "hard";
  let route = documentRoute;
  if (metric.navigationURL) {
    try {
      route = routeCategoryForPath(new URL(metric.navigationURL, "https://sastra.invalid").pathname);
    } catch {
      return null;
    }
  } else if (navigation === "client") {
    // An unattributable soft-navigation metric would corrupt route comparisons.
    return null;
  }
  return { name: metric.name as WebVitalName, route, navigation, value: metric.value };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => own.includes(key));
}

export function isValidMetricValue(name: string, value: unknown): value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return false;
  return value <= (name === "CLS" ? MAX_CLS : MAX_MILLISECONDS);
}

/** Strict parse: any unknown field, name, enum, or out-of-range number rejects the whole report. */
export function parsePerformanceReport(input: unknown): PerformanceReport | null {
  if (!isPlainObject(input) || !hasExactKeys(input, ["version", "observations"])) return null;
  if (input.version !== 1) return null;
  const { observations } = input;
  if (
    !Array.isArray(observations) ||
    observations.length === 0 ||
    observations.length > MAX_OBSERVATIONS_PER_REPORT
  ) {
    return null;
  }
  const parsed: PerformanceObservation[] = [];
  for (const item of observations) {
    if (!isPlainObject(item) || !hasExactKeys(item, ["name", "route", "navigation", "value"])) {
      return null;
    }
    const { name, route, navigation, value } = item;
    if (typeof name !== "string" || !METRIC_NAMES.includes(name)) return null;
    if (!isRouteCategory(route)) return null;
    if (typeof navigation !== "string" || !(NAVIGATION_KINDS as readonly string[]).includes(navigation)) {
      return null;
    }
    if (!isValidMetricValue(name, value)) return null;
    const metric = name as MetricName;
    const expectedRoute = (USEFUL_WORK_ROUTES as Record<string, RouteCategory>)[metric];
    if (expectedRoute && expectedRoute !== route) return null;
    parsed.push({ name: metric, route, navigation: navigation as NavigationKind, value });
  }
  return { version: 1, observations: parsed };
}

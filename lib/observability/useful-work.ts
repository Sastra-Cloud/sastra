import {
  USEFUL_WORK_ROUTES,
  routeCategoryForPath,
  type NavigationKind,
  type PerformanceObservation,
  type RouteCategory,
  type UsefulWorkName,
} from "./performance-report";

type Sink = (observation: PerformanceObservation) => void;

type Navigation = {
  epoch: number;
  start: number;
  kind: NavigationKind;
  route: RouteCategory;
  reported: Set<UsefulWorkName>;
  observations: PerformanceObservation[];
};

/**
 * Tracks the current navigation and when useful work first becomes available
 * in it. A new navigation cancels everything pending from the previous one,
 * so a slow page can never be credited to the route that replaced it.
 *
 * `start` is a `performance.now()` timestamp: 0 for a document load (the
 * browser's time origin) and the click time for an in-app route change.
 */
export function createUsefulWorkTracker(now: () => number) {
  let epoch = 0;
  let navigation: Navigation | null = null;
  const sinks = new Set<Sink>();

  return {
    /** Starts a navigation. Only the path's category is kept, never the path. */
    begin(pathname: string, kind: NavigationKind) {
      epoch += 1;
      navigation = {
        epoch,
        start: kind === "hard" ? 0 : now(),
        kind,
        route: routeCategoryForPath(pathname),
        reported: new Set(),
        observations: [],
      };
    },
    current() {
      return navigation
        ? { epoch: navigation.epoch, start: navigation.start, kind: navigation.kind, route: navigation.route }
        : null;
    },
    /**
     * Records that `name` happened. Ignored when it belongs to another route,
     * to a navigation that has been replaced (`options.epoch`), or when it has
     * already been recorded for this navigation.
     */
    report(name: UsefulWorkName, options: { epoch?: number; at?: number } = {}) {
      const active = navigation;
      if (!active) return false;
      if (options.epoch !== undefined && options.epoch !== active.epoch) return false;
      if (USEFUL_WORK_ROUTES[name] !== active.route) return false;
      if (active.reported.has(name)) return false;
      const value = (options.at ?? now()) - active.start;
      if (!Number.isFinite(value)) return false;
      active.reported.add(name);
      const observation: PerformanceObservation = {
        name,
        route: active.route,
        navigation: active.kind,
        value: Math.max(0, value),
      };
      // At most four fixed-name observations per navigation. A reporter may
      // mount after child hydration effects have already recorded readiness.
      active.observations.push(observation);
      for (const sink of sinks) sink(observation);
      return true;
    },
    subscribe(sink: Sink, { replay = false } = {}) {
      sinks.add(sink);
      if (replay) navigation?.observations.forEach(sink);
      return () => {
        sinks.delete(sink);
      };
    },
  };
}

export const usefulWork = createUsefulWorkTracker(() =>
  typeof performance === "undefined" ? 0 : performance.now()
);

/** Starts the document-load navigation and keeps local User Timing in sync. */
export function installUsefulWorkTracking() {
  usefulWork.begin(window.location.pathname, "hard");
  usefulWork.subscribe(writeUserTiming);
}

/** Called by Next.js when an in-app navigation starts. */
export function noteClientNavigation(url: string) {
  try {
    usefulWork.begin(new URL(url, window.location.href).pathname, "client");
  } catch {
    // An unparseable URL must not break navigation.
  }
}

/**
 * One `sastra:<name>` measure per marker, replaced on each navigation, so
 * browser tests can read `performance.getEntriesByName`. Nothing leaves the
 * page from here.
 */
function writeUserTiming(observation: PerformanceObservation) {
  try {
    const name = `sastra:${observation.name}`;
    const start = usefulWork.current()?.start ?? 0;
    performance.clearMeasures(name);
    performance.measure(name, {
      start,
      end: start + observation.value,
      detail: { route: observation.route, navigation: observation.navigation },
    });
  } catch {
    // User Timing is a convenience only.
  }
}

type ElementTimingEntry = PerformanceEntry & {
  identifier?: string;
  renderTime?: number;
  loadTime?: number;
};

/**
 * Reports `name` when the element carrying `elementtiming="<identifier>"` is
 * first painted after this navigation began. The browser measures the paint
 * itself, so server-rendered content counts before hydration. Browsers
 * without Element Timing (Safari, Firefox) report nothing rather than a guess.
 */
export function observeVisibleElement(name: UsefulWorkName, identifier: string, epoch: number) {
  if (
    typeof PerformanceObserver === "undefined" ||
    !PerformanceObserver.supportedEntryTypes?.includes("element")
  ) {
    return () => {};
  }
  const start = usefulWork.current()?.start ?? 0;
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as ElementTimingEntry[]) {
      if (entry.identifier !== identifier) continue;
      const at = entry.renderTime || entry.loadTime || entry.startTime;
      // Buffered entries from the previous page of this kind are not ours.
      if (at < start) continue;
      usefulWork.report(name, { epoch, at });
      observer.disconnect();
      return;
    }
  });
  try {
    observer.observe({ type: "element", buffered: true });
  } catch {
    return () => {};
  }
  return () => observer.disconnect();
}

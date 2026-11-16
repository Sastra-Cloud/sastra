/**
 * Marks devices that should skip expensive visual effects, by setting
 * `data-low-power` on `<html>`. Styles opt in with the `low-power:` variant
 * (see app/globals.css), for example to replace a blurred translucent bar with
 * a solid one. It only removes decoration; no feature may depend on it.
 *
 * The signals are coarse on purpose. A wrong guess costs a blur, not behavior.
 */

/** Chrome reports device memory in GiB, rounded down to a power of two. */
const LOW_MEMORY_GB = 4;
const LOW_CORE_COUNT = 4;

type TierNavigator = {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connection?: { saveData?: boolean };
};

export function isLowPowerDevice(
  nav: TierNavigator,
  prefersReducedTransparency: boolean
): boolean {
  if (prefersReducedTransparency) return true;
  if (nav.connection?.saveData) return true;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= LOW_MEMORY_GB) return true;
  return typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= LOW_CORE_COUNT;
}

/** Runs before hydration (instrumentation-client.ts), so the first paint is already cheap. */
export function installDeviceTier() {
  if (typeof document === "undefined") return;
  try {
    const reducedTransparency =
      window.matchMedia?.("(prefers-reduced-transparency: reduce)").matches ?? false;
    if (isLowPowerDevice(navigator as TierNavigator, reducedTransparency)) {
      document.documentElement.dataset.lowPower = "";
    }
  } catch {
    // Detection is a convenience; the full-effect styles still work.
  }
}

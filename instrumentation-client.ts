import { installDeploymentGuard } from "@/lib/pwa/client-update";
import {
  installUsefulWorkTracking,
  noteClientNavigation,
} from "@/lib/observability/useful-work";
import { installDeviceTier } from "@/lib/ui/device-tier";

installDeviceTier();
installDeploymentGuard();
// Local markers only; nothing is sent unless the operator enables reporting.
installUsefulWorkTracking();

export function onRouterTransitionStart(url: string) {
  noteClientNavigation(url);
}

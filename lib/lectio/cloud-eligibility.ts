import "server-only";
import { getEntitlement } from "@/lib/hosted/entitlements";
import { hostedInstanceId } from "@/lib/hosted/mode";
import { IntegrationError, identifier } from "./protocol/contract";
import { integrationOrigin } from "./protocol/transport";

/** Local feature gate; Lectio independently verifies the private Cloud registry. */
export async function assertLectioCloudEligibility(): Promise<string> {
  const origin = integrationOrigin(process.env.BETTER_AUTH_URL || "http://localhost:3243");
  const devId = process.env.SASTRA_LECTIO_DEV_INSTANCE_ID;
  if (process.env.NODE_ENV !== "production" && devId && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname) &&
    (process.env.TRANSLATION_INTEGRATION_DEV_ORIGINS ?? "").split(",").includes(origin)) return devId;
  const managedId = process.env.SASTRA_LECTIO_MANAGED_INSTANCE_ID;
  if (managedId && process.env.SASTRA_LECTIO_MANAGED_ORIGIN === origin && new URL(origin).protocol === "https:") {
    // This identifies an operator-managed deployment without changing billing/seat behavior.
    // Managed Lectio still requires a current, exact private registry grant for this ID/origin.
    return identifier(managedId);
  }
  const id = hostedInstanceId();
  const entitlement = id ? await getEntitlement() : null;
  if (!id || entitlement?.instanceId !== id || entitlement.billingState !== "active") {
    throw new IntegrationError("cloud_subscription_required", "Lectio is available with an active, paid Sastra Cloud workspace.", 403);
  }
  return id;
}

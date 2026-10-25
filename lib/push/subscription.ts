import { z } from "zod";

// A subscription is an outbound network destination, not just browser metadata.
// Restrict it to browser push providers; never accept arbitrary HTTPS hosts.
const endpointSchema = z.string().max(2048).url().refine((value) => {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" || url.username || url.password ||
      url.port || url.hash
    ) return false;

    return url.hostname === "fcm.googleapis.com" ||
      url.hostname === "updates.push.services.mozilla.com" ||
      url.hostname.endsWith(".push.apple.com") ||
      url.hostname.endsWith(".notify.windows.com");
  } catch {
    return false;
  }
}, "Unsupported push service").transform((value) => new URL(value).href);

export const pushSubscriptionSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
});

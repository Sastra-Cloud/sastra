export type SupportConfiguration = {
  url: string;
  instanceId: string;
  secret: string;
};
/** Enrollment is independent of hosted billing. No configuration means no network activity. */
export function supportConfiguration(
  env: Record<string, string | undefined> = process.env,
): SupportConfiguration | null {
  const url = env.SASTRA_SUPPORT_URL?.trim(),
    instanceId = env.SASTRA_SUPPORT_INSTANCE_ID?.trim(),
    secret = env.SASTRA_SUPPORT_SECRET?.trim();
  if (!url || !instanceId || !secret) return null;
  try {
    const u = new URL(url);
    if (
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      (u.protocol !== "https:" &&
        !(
          env.NODE_ENV !== "production" &&
          ["localhost", "127.0.0.1"].includes(u.hostname)
        ))
    )
      return null;
    return { url: u.origin, instanceId, secret };
  } catch {
    return null;
  }
}
export function supportRouteSummary(route: string) {
  const path = route.split(/[?#]/)[0] ?? "/";
  const segments = path.split("/");
  return (
    segments
      .map((p, n) =>
        n === 2 &&
        ["projects", "wiki", "tasks", "correspondence"].includes(
          segments[1] ?? "",
        )
          ? ":id"
          : /^[0-9a-f-]{16,}$/i.test(p) || /^\d+$/.test(p)
            ? ":id"
            : p,
      )
      .join("/")
      .slice(0, 200) || "/"
  );
}

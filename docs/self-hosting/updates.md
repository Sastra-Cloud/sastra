# Keeping open app windows usable after deployments

An installed PWA can remain open for days. Replacing its server can leave its
JavaScript referencing Server Action IDs and assets from an older build. The
service worker is not an app-version signal: ours only caches the offline page,
and its bytes do not change when application code changes.

## Application protections

- Each production build gets a unique `deploymentId`. `NEXT_DEPLOYMENT_ID` can
  supply an explicit value at build time; otherwise a UUID is generated. Build
  once and deploy the same image to every replica. Do not reuse an ID across
  different builds or set a different value on each replica.
- The ID is embedded in the client bundle. The server reads the same value from
  `.next/required-server-files.json`, including at `next start`. `/api/version`
  reports that value without caching. Do not use `.next/BUILD_ID` as the primary
  version signal: Next 16.3 makes it constant when `deploymentId` is set.
- Client instrumentation installs one shared Server Action transport guard
  before hydration. It checks the loaded version before every same-origin
  action POST, shares simultaneous version checks, and reports update-required
  errors in plain language. Next's explicit `x-nextjs-action-not-found` signal
  also catches a deployment between the check and POST.
- Checks also run on focus, visibility, page restoration, reconnect, and once
  per minute while active. An unavailable version endpoint does not prove skew;
  normal action error handling still applies. Version checks time out after
  three seconds.
- There is no automatic reload or request replay. The explicit refresh waits
  for same-origin mutation fetches to settle, and draft owners can veto it if
  they cannot preserve their work. Existing optimistic actions receive a
  rejection and use their normal rollback behavior. Forms with local error
  handling retain their state; an uncaught action error uses the page's update
  recovery screen.
- New-channel creation uses a stable authenticated JSON endpoint, retaining the
  existing role, validation, and transactional membership checks. Its draft can
  survive the explicit update refresh in per-account session storage for one
  hour. Other forms and attachments must be copied or completed before reload.

The fetch guard depends on the Next action request and not-found response
headers. Recheck these contracts in the installed Next source when upgrading.
Clients already open before these protections shipped need one manual refresh.

## Deployment limits

`deploymentId` detects skew; it does **not** route a request to an older server.
For uninterrupted sessions during a rolling deployment, retain the previous
deployment and route requests using the deployment headers at the proxy/CDN.
Otherwise a stale window must refresh before continuing build-specific actions.
Keep old immutable assets available if serving them from a shared CDN.

Use the same built image across replicas. If building separately, Next also
requires a consistent `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` at build time for
Server Function closures. Keep this secret in the build system; do not put it
in `NEXT_PUBLIC_*`, source code, or Docker build arguments. A shared key alone
does not preserve removed actions or make changed client code compatible.

Do not cache authenticated HTML, RSC responses, action POSTs, or `/api/version`
in the proxy/service worker. Do not retry writes after timeouts: an email,
payment, or creation may already have completed. Check the resulting state
before a person explicitly retries.

## Primary references

Reviewed October 20, 2026, against the installed Next 16.3.8 docs and current
official guidance:

- [Next.js deploymentId](https://nextjs.org/docs/app/api-reference/config/next-config-js/deploymentId)
- [Self-hosting: multiple servers and version skew](https://nextjs.org/docs/app/guides/self-hosting#version-skew)
- [Failed to find Server Action](https://nextjs.org/docs/messages/failed-to-find-server-action)
- [Service worker lifecycle](https://web.dev/articles/service-worker-lifecycle)

The installed 16.3 docs/source take precedence where later online releases
differ (notably `generateBuildId` behavior with `deploymentId`).

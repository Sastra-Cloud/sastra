# Security policy

## Reporting a vulnerability

Please email **security@sastra.cloud**. Do not open a public issue for a
security problem.

Include what you found, the version (`GET /api/version` on your instance or the
release tag), steps to reproduce, and the impact you believe it has. You will
get an acknowledgement within three working days and a fix or mitigation plan
within fourteen days for confirmed issues. We credit reporters in the release
notes unless you ask us not to.

## Supported versions

Only the latest release line receives security fixes. Self-hosters should stay
on the latest tagged release; hosted workspaces are upgraded for them.

## What is in scope

- The Sastra application in this repository, including its API routes, cron
  tick, inbound-email webhooks, and management endpoints.
- The published container images and the Compose bundle under `deploy/`.

Out of scope: third-party services (OpenRouter, Resend, Cloudflare, Paddle),
denial of service by volume, and reports that require a compromised
administrator account.

## How releases are checked

Every push and pull request runs typecheck, lint, tests, a production build, and
a production dependency audit. Releases build multi-architecture images with an
attached SBOM. The in-app **Settings → Security** page shows the audit state of
the running version.

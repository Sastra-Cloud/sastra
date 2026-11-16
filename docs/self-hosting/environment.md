# Environment variables

Every setting Sastra reads. Required ones are marked ✅; ➖ is optional; ⚠️
means the app runs without it but a feature degrades. `.env.example` at the
repository root carries the same list with comments.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL 18 or newer connection string; use `sslmode=verify-full` for external production databases. For our recommended managed option, see [Neon setup](./neon.md) |
| `NODE_EXTRA_CA_CERTS` | ➖ | Needed when the database uses a private CA, such as Coolify's mounted `/etc/ssl/certs/coolify-ca.crt`. Neon uses publicly trusted certificates and needs no Coolify CA |
| `BETTER_AUTH_URL` | ✅ | **Exact** public HTTPS URL (e.g. `https://sastra.example`). Drives auth callbacks, magic/invite links, email CTAs, and Origin/CORS checks — must be exact |
| `BETTER_AUTH_SECRET` | ✅ | `openssl rand -base64 32` |
| `AUTH_PROVISIONING_SECRET` | ✅ | Separate secret for first-admin setup and invitation grants; generate with `openssl rand -base64 32` |
| `SMTP_HOST` | ✅ | e.g. `smtp.postmarkapp.com` |
| `SMTP_PORT` | ✅ | `587` (STARTTLS) or `465` (TLS) |
| `SMTP_USER` / `SMTP_PASS` | ✅ | provider credentials / API token |
| `SMTP_FROM` | ✅ | e.g. `Sastra <noreply@sastra.example>` — verify the domain's SPF/DKIM so mail isn't spam |
| `EMAIL_PROVIDER` / `RESEND_API_KEY` | ➖ | alternative to SMTP: set `RESEND_API_KEY` (and optionally `EMAIL_PROVIDER=resend`) to send through Resend's HTTPS API on hosts that block SMTP. `EMAIL_FROM` overrides `SMTP_FROM` |
| `CORRESPONDENCE_ADDRESS` | ➖ | the correspondence address when it is not a Gmail mailbox; quote requests, invoices, and replies are sent as it through the provider above |
| `RESEND_WEBHOOK_SECRET` | ➖ | inbound mail by webhook instead of IMAP: Resend's signing secret for the receiving webhook that posts to `/api/email/inbound/resend` (also needs `RESEND_API_KEY`) |
| `INBOUND_WEBHOOK_SECRET` | ➖ | inbound mail from a generic relay that POSTs each raw `.eml`, HMAC-signed, to `/api/email/inbound` |
| `R2_ACCOUNT_ID` | ✅ (R2) | Cloudflare account id; also the fallback for `CLOUDFLARE_ACCOUNT_ID` (voice transcription) |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | ✅ | S3 access key pair (R2 API token, Railway Bucket credentials, MinIO user). Aliases: `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` |
| `R2_BUCKET` | ✅ | bucket name (e.g. `sastraworkdata`). Alias: `S3_BUCKET` |
| `R2_ENDPOINT` | ✅ | `https://<account-id>.r2.cloudflarestorage.com`, or any S3-compatible endpoint. Alias: `S3_ENDPOINT` |
| `R2_REGION` | ➖ | S3 signing region; defaults to `auto` (R2, MinIO). Alias: `S3_REGION`. `R2_*` wins over `S3_*` when both are set |
| `OPENROUTER_API_KEY` | ⚠️ | needed for the assistant, AI planning, document extraction, drafting, and summaries. An admin can also save the key in Settings → AI. Manual planning and tracking work without AI |
| `TYPESAFEAI_API_KEY` | ➖ | optional — fast typed pre-checks (TypeSafe Jev) that skip unnecessary AI calls in email intake and assistant routing. Also needs a super admin to enable **Fast AI pre-checks** in Settings → AI; unset or disabled = previous behavior |
| `CRON_SECRET` | ✅ | `openssl rand -base64 32` — shared bearer for `/api/cron/*` |
| `MIGRATE_ON_START` | ➖ | default `true`: the container migrates and bootstraps before serving. Set `false` when a pre-deploy command runs `node scripts/migrate.mjs && node scripts/bootstrap-workspace.mjs` instead |
| `DATABASE_MIGRATION_URL` | ➖ | direct (unpooled) connection for migrations; defaults to `DATABASE_URL`. Needed only when `DATABASE_URL` goes through a transaction-mode pooler |
| `DB_MAX_CONNECTIONS` | ➖ | pool size, default `10` |
| `DB_IDLE_TIMEOUT` | ➖ | seconds before an idle connection closes, default `120`; `0` keeps connections open |
| `DB_PREPARE` | ➖ | `false` behind a transaction-mode pooler (PgBouncer); Neon `-pooler` hosts are detected automatically |
| `SASTRA_VERSION` / `SASTRA_REVISION` | ➖ | set by the release image build; reported by `/api/version` and `/api/ready` |
| `SECURITY_STATUS_URL` | ➖ | where the daily published dependency-audit results are read from; defaults to the public repository's feed, forks set their own, `off` disables |
| `SENTRY_DSN` | ➖ | optional — server error monitoring; unset = no-op |
| `SASTRA_PERFORMANCE_MONITORING` | ➖ | `true` turns on anonymous browser performance reports (see [Performance monitoring](#optional-performance-monitoring)); unset or `false` = nothing is collected or sent. Read at runtime, so a restart is enough |
| `VAPID_PUBLIC_KEY` | ➖ | Web Push public key (`npx web-push generate-vapid-keys`); unset = push off. Read at runtime, so the published image needs no rebuild. The older name `NEXT_PUBLIC_VAPID_PUBLIC_KEY` also works |
| `VAPID_PRIVATE_KEY` | ➖ | Web Push private key (server secret); pair of the public key above |
| `VAPID_SUBJECT` | ➖ | `mailto:` or `https:` contact URL required by push services |

Additional settings:

| Variable | Required | Notes |
|---|---|---|
| `APP_ENCRYPTION_KEY` | ➖ | encrypts secrets stored in the database (the Settings ▸ AI key); falls back to `BETTER_AUTH_SECRET` |
| `ENABLE_INITIAL_ADMIN_BOOTSTRAP` | ✅ (first run) | `true` shows **Create the first admin** on `/login` while no account exists; set it back to `false` after the first account is created |
| `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_TOKEN` | ✅ (first run, production) | the only email allowed to create the first admin, and the one-time token typed on that screen; remove both after the first account exists |
| `PORT` | ➖ | listening port, default `3000` |
| `SASTRA_CLOUD_INSTANCE_ID` / `SASTRA_CLOUD_MANAGEMENT_SECRET` / `SASTRA_CLOUD_ACCOUNT_URL` | never for self-hosting | set only by the Sastra Cloud control plane; leave unset |

## Optional private support enrollment

By default, Help links to community Discussions and GitHub issues. No support service calls, installation registration, or diagnostic uploads occur.

An explicitly enrolled installation can configure `SASTRA_SUPPORT_URL`, `SASTRA_SUPPORT_INSTANCE_ID`, and `SASTRA_SUPPORT_SECRET`. All three are required. Use an HTTPS service URL and a dedicated revocable credential supplied by the operator. These are server-only variables; never expose the secret in client bundles or a public repository. The integration signs each request and uses the documented `/support/v1/instance` ticket API.

Enrollment is independent of hosted billing. Setting these variables does not enable subscription mode, seat limits, AI credit caps, or hosted scheduling. The internal Coolify pilot can therefore use private support while preserving its existing behavior. Revoke or remove enrollment to return to community links.

Requests are visible to their reporter, workspace admins, the cloud account owner, and support operators. Diagnostics are reviewed before submission and attachments are explicitly selected. Security reports still follow `SECURITY.md`.

### Lectio integration

Project sync and shared sign-in with the managed Lectio platform require an eligible
paid Sastra Cloud workspace or a deployment explicitly managed and approved by the
Sastra operator. Other self-hosted installations explain this restriction in
Settings; copying hosted environment values cannot grant access. Lectio verifies
the instance against the private Cloud registry and, for Cloud subscriptions, current
production billing. Operator-managed approval is private, explicit, and revocable.

## Optional performance monitoring

Off by default. Set `SASTRA_PERFORMANCE_MONITORING=true` and restart to let signed-in browsers send a few anonymous numbers to `POST /api/observability/performance`. The server writes them to its structured log as `performance.report` lines. No analytics service, schema change, or third-party script is involved.

What is collected, and nothing else:

- Web Vitals: `TTFB`, `FCP`, `LCP`, `INP`, `CLS`.
- Useful-work markers: `dashboard-tasks-visible`, `dashboard-tasks-ready`, `chat-messages-visible`, `chat-composer-ready`.
- For each: a fixed route category (`dashboard`, `projects`, `project`, `chat`, `other`), whether it was a document load (`hard`) or an in-app route change (`client`), and one number. Times are in milliseconds from the start of that navigation; `CLS` has no unit.
- The server adds its own deployment id. Browsers never send URLs, project or channel ids, names, text, user ids, or browser entry objects.

Meaning of the markers:

- `*-visible` is when the browser first painted the content, measured with the browser's Element Timing. Chromium reports it; Safari and Firefox do not, so those browsers send no `*-visible` value instead of a guess.
- `*-ready` is when React finished hydrating that part of the page, so buttons and inputs work. It can come after `*-visible`.
- A route change resets measurement. Work finishing after you have moved on is discarded.

Limits: reports are validated against a fixed list, capped at 2 KB and 12 numbers, rate limited per person, rejected from other origins, and never logged when rejected. A page sends at most six reports. Reporting never delays or blocks anything the person is doing. Treat the numbers as a sample from real devices, not a benchmark. Sentry or any other monitor is not required.

Even when the setting is off, the browser records the four markers as local `sastra:*` User Timing measures. They never leave the page and let `docs/browser-verification.md` scenarios read them.

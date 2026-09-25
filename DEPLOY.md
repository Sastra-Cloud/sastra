# Deploying Sastra to Coolify

This walks through everything to get Sastra live on [Coolify](https://coolify.io).
You need: a Coolify instance, a Postgres database, an SMTP provider, a Cloudflare R2
bucket, and an OpenRouter API key.

---

## 1. Provision the database

Create a **PostgreSQL 18 service with pgvector 0.8+ available** in Coolify (or
use an external managed PostgreSQL service that supports the `vector`
extension). Production currently uses `pgvector/pgvector:pg18`, which layers
pgvector onto the official PostgreSQL 18 image and supports Coolify's native
PostgreSQL SSL configuration. For reproducible upgrades, pin a tested pgvector
version tag or image digest instead of leaving the floating `pg18` tag
indefinitely. Note its connection string—you'll set it as `DATABASE_URL`.

For an existing deployment, take and test a backup first, restore it into the
pgvector-enabled PostgreSQL 18 service, then point `DATABASE_URL` at the restored
database. Verify `SELECT default_version FROM pg_available_extensions WHERE
name = 'vector';` returns a version before deploying the app. The application
migration runs `CREATE EXTENSION IF NOT EXISTS vector`; it intentionally fails
instead of deploying an incomplete Wiki search index when the extension is
unavailable.

> Migrations run automatically on every deploy (see §4), so you don't need to run
> anything by hand.

### Require verified TLS

Do not use Coolify's original unencrypted database URL in production. In the
PostgreSQL resource:

1. Open **General**, enable **SSL**, and select **verify-full**.
2. Copy the new SSL-enabled connection URL. The hostname in that URL must match
   the generated certificate.
3. Add this read-only bind mount to the Sastra application:
   `/data/coolify/ssl/coolify-ca.crt:/etc/ssl/certs/coolify-ca.crt:ro`
4. Set `NODE_EXTRA_CA_CERTS=/etc/ssl/certs/coolify-ca.crt` on the application.
5. Replace `DATABASE_URL` and `ASSISTANT_DATABASE_RO_URL` with their
   SSL-enabled equivalents containing `sslmode=verify-full`.
6. Redeploy, then run the `security-monitor` scheduled task. **Settings →
   Security → Database transport** must report **Encrypted**.

`verify-full` is deliberately fail-closed: Sastra will not connect when TLS,
the signing CA, or the database hostname cannot be verified. Coordinate the
database setting, bind mount, environment variables, and redeploy in one
maintenance window.

Coolify stores PostgreSQL persistent data on the host. Disk-at-rest encryption
therefore belongs to the server or cloud block-volume layer, not the Sastra
container. Verify that the volume backing Docker's PostgreSQL data directory is
encrypted by the hosting provider. If the current root or data disk is not
encrypted, provision an encrypted volume or replacement server and migrate the
database rather than attempting an unsafe in-place conversion.

## 2. Create the application

1. **New Resource → Application → from your Git repo** (your fork of `github.com/Sastra-Cloud/sastra`, branch `main`).
2. **Build pack: Dockerfile** (the repo ships a production `Dockerfile`).
3. Set the **port to `3000`** (the container listens there).
4. Attach your domain and enable HTTPS — then set `BETTER_AUTH_URL` to that exact URL.

## 3. Environment variables

Set these on the application (Coolify → Environment Variables). They mirror
[`.env.example`](./.env.example). Generate secrets with `openssl rand -base64 32`.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | SSL-enabled Postgres connection string from §1, using `sslmode=verify-full` in production |
| `NODE_EXTRA_CA_CERTS` | ✅ | Production path `/etc/ssl/certs/coolify-ca.crt` for Coolify's mounted CA |
| `BETTER_AUTH_URL` | ✅ | **Exact** public HTTPS URL (e.g. `https://sastra.example`). Drives auth callbacks, magic/invite links, email CTAs, and Origin/CORS checks — must be exact |
| `BETTER_AUTH_SECRET` | ✅ | `openssl rand -base64 32` |
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
| `OPENROUTER_API_KEY` | ⚠️ | needed for the AI planner + standup insights; without it those degrade, everything else works |
| `TYPESAFEAI_API_KEY` | ➖ | optional — fast typed pre-checks (TypeSafe Jev) that skip unnecessary AI calls in email intake and assistant routing. Also needs a super admin to enable **Fast AI pre-checks** in Settings → AI; unset or disabled = previous behavior |
| `CRON_SECRET` | ✅ | `openssl rand -base64 32` — shared bearer for `/api/cron/*` |
| `MIGRATE_ON_START` | ➖ | default `true`: the container migrates and bootstraps before serving. Set `false` when a pre-deploy command runs `node scripts/migrate.mjs && node scripts/bootstrap-workspace.mjs` instead |
| `DATABASE_MIGRATION_URL` | ➖ | direct (unpooled) connection for migrations; defaults to `DATABASE_URL`. Needed only when `DATABASE_URL` goes through a transaction-mode pooler |
| `DB_MAX_CONNECTIONS` | ➖ | pool size, default `10` |
| `DB_IDLE_TIMEOUT` | ➖ | seconds before an idle connection closes, default `120`; `0` keeps connections open |
| `DB_PREPARE` | ➖ | `false` behind a transaction-mode pooler (PgBouncer); Neon `-pooler` hosts are detected automatically |
| `SASTRA_VERSION` / `SASTRA_REVISION` | ➖ | set by the release image build; reported by `/api/version` and `/api/ready` |
| `SENTRY_DSN` | ➖ | optional — server error monitoring; unset = no-op |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | ➖ | Web Push public key (`npx web-push generate-vapid-keys`); unset = push off |
| `VAPID_PRIVATE_KEY` | ➖ | Web Push private key (server secret); pair of the public key above |
| `VAPID_SUBJECT` | ➖ | `mailto:` or `https:` contact URL required by push services |

**Authorization model:** Sastra is a single trusting team, so any signed-in
teammate can **view** every project; **edits** to rights, budgets, team, and
settings are role-gated (managers/admins). `lib/auth/guards.ts` exposes
`assertProjectAccess(projectId, { membersOnly })` as the seam to tighten view
access to project members later, without reworking pages.

SMTP is **required** — auth (magic links, first-admin, invites) and notifications
depend on it. The app is unusable without working SMTP in production.

## 4. Migrations on deploy

The container applies migrations and then runs the idempotent workspace baseline
bootstrap before starting Next.js. The bootstrap inserts only missing roles,
templates, AI task rows, the standup bot, and the general channel; it never
overwrites changes made in Settings.

The migration runner holds a Postgres advisory lock, so two replicas starting at
once cannot migrate at the same time. To keep cold starts fast, or to migrate
before the new version serves any traffic, set `MIGRATE_ON_START=false` and run
`node scripts/migrate.mjs && node scripts/bootstrap-workspace.mjs` as a Coolify
**pre-deploy command** instead.

Two public endpoints report state without a session:

- `GET /api/health` returns `OK` without touching the database. Use it for the
  container healthcheck.
- `GET /api/ready` returns `200` only when the database answers, its schema
  matches this build's last migration, and the baseline bootstrap has run;
  otherwise `503` with `checks` explaining which part is not ready. It queries
  the database, so use it after a deploy, not as a frequent probe.

## 5. Scheduled tasks (cron)

Sastra needs **one Scheduled Task** in Coolify (or any cron that can make an HTTP
request): call `POST /api/cron/tick` every minute with
`Authorization: Bearer <CRON_SECRET>` (the route returns `401` without it).
Coolify tasks attached to the application should call the container-local app
at `http://127.0.0.1:${PORT:-3000}`.

```bash
curl -fsS -X POST "http://127.0.0.1:${PORT:-3000}/api/cron/tick" \
  -H "Authorization: Bearer $CRON_SECRET"
```

The tick runs whichever jobs are due and returns `nextDueAt`, the time the next
job has work. Calling it more often than that is harmless: jobs that are not due
are skipped, and a job already running in another call is left alone.

| Job | Runs | Purpose |
|---|---|---|
| `notification-emails` | when a queued email is due | Send due direct mentions, bundled updates, and weekday notification digests |
| `standup` | at each standup's scheduled time, every 15 min while one is open, and after local midnight | Start due standups, post the bot questions, mark missed runs, generate AI/heuristic digests |
| `gmail-poll` | every 5 min in work hours, hourly outside them; only when the capture mailbox is configured | Poll the mailbox, ingest correspondence, reconcile external follow-ups, and auto-extract printer quotes/invoices |
| `weekly-digest` | inside the weekday/hour configured in Workspace Settings | Send the manager deadline digest |
| `wiki-search-index` | every 5 min while chunks wait, hourly otherwise | Backfill published Wiki pages, generate semantic embeddings, and retry interrupted indexing |
| `agreement-index` | every 10 min while documents wait, hourly otherwise | Backfill MoU and License attachments, generate search embeddings, and retry interrupted indexing |
| `recompute-blockers` | daily at 06:00 workspace time | Recompute project blockers (rights/budget/overdue/stalled), update health, send overdue notifications |
| `donation-upload-cleanup` | daily at 03:10 | Remove abandoned donation uploads after 24 hours and imported source CSVs after their retention deadline |
| `wiki-media-cleanup` | daily at 03:20 | Delete failed or orphaned Wiki media and hard-delete pages 30 days after deletion |
| `security-monitor` | daily at 03:30 | Check dependency reporting and PostgreSQL TLS; alert active super admins when attention is required |
| `assistant-reflection` | daily at 04:00 | Review-only assistant learning, email intake reflection, and project-update review |

The per-job routes (`POST /api/cron/<job>`) still work as aliases that force
that one job, so existing scheduled tasks can be replaced one at a time. To run
a specific job on demand, send `{"jobs":["standup"],"force":true}` as the JSON
body of the tick request.

## 6. Cloudflare R2 — bucket + CORS

Keep the bucket **private**. The browser uploads files directly to R2 with a
presigned `PUT` and downloads via a presigned `GET`, so the bucket needs a CORS
rule allowing your app origin:

```json
[
  {
    "AllowedOrigins": ["https://sastra.example", "http://localhost:3243"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Content-MD5"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Include every origin the app is served from (the production domain **and**
`http://localhost:3243` for local dev) — a browser `PUT` to a presigned URL
triggers a CORS preflight, so a missing origin shows up as "Failed to fetch" on
upload. You can apply this policy with `node --env-file=.env scripts/r2-cors.mjs
<origin> [origin ...]` if your R2 token has admin permissions, or paste it in the
Cloudflare dashboard (R2 → bucket → Settings → CORS Policy).

(The budget Excel export streams **through the app**, so it needs no R2 rule.)

## 7. Postgres backups

Enable Coolify's automated Postgres backups (daily) to R2/S3 with retention ≥ 7
days, and **test a restore once**. The app is migration-driven, so a restore +
redeploy reapplies any newer migrations cleanly.

## 7b. PWA & Web Push

The app is an installable PWA and can deliver Web Push notifications (every
in-app notification — assignment, mention, blocker, overdue, standup — also
pushes, gated per-user by category opt-outs, quiet hours, and an out-of-office
pause).

- **Enable push:** generate a VAPID key pair once with
  `npx web-push generate-vapid-keys`, then set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`. With them unset, the app still
  installs and works — only push is disabled (no-op).
- **No third-party service or cost** — push is sent from the Node server via the
  `web-push` library straight to the browser's push endpoint.
- **`/sw.js` is served `no-store`** (via `next.config.ts` headers) so devices are
  never stranded on an old service worker — no host config needed.
- **iOS requires installation:** on iPhone/iPad, users must **Add to Home Screen**
  (Share → Add to Home Screen) before push works (iOS 16.4+). The toggle in
  **Settings ▸ Notifications** shows this hint automatically.
- Icons/manifest are built-in (`app/manifest.ts`, `app/icon.png`); regenerate the
  icon set with `node scripts/gen-icons.mjs` if the brand art changes.

## 8. First run

1. Deploy. Watch the logs for `Migrations applied.` then `Ready`.
2. Visit the app → `/login` shows **"Create the first admin"**. Create the account,
   then complete the required organization, language, timezone, and currency setup.
3. Refine invoice, print, finance, and AI context in **Settings → Workspace**.
4. Smoke-test SMTP: sign out, choose **"Email me a magic link"**, and confirm the
   email arrives (proves SMTP is configured). Then invite teammates from
   **Settings ▸ Team**.

## 9. Post-deploy checklist

- [ ] App reachable over HTTPS; `BETTER_AUTH_URL` matches it exactly.
- [ ] First-admin created; magic-link email received.
- [ ] An invite email is received by a teammate.
- [ ] A file upload + download works (R2 CORS correct).
- [ ] All cron tasks return `200` (check Coolify task logs).
- [ ] Ask the Assistant about a published Wiki tutorial and open the returned Wiki link.
- [ ] Postgres backup ran and a restore was tested.
- [ ] (If using AI) the project planner returns a plan — confirms `OPENROUTER_API_KEY`.
- [ ] (If using push) install the PWA, enable push in **Settings ▸ Notifications**, assign yourself a task → a push notification arrives (test on a real iPhone too).

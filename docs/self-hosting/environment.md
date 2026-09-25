# Environment variables

Every setting Sastra reads. Required ones are marked ✅; ➖ is optional; ⚠️
means the app runs without it but a feature degrades. `.env.example` at the
repository root carries the same list with comments.

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
| `SECURITY_STATUS_URL` | ➖ | where the daily published dependency-audit results are read from; defaults to the public repository's feed, forks set their own, `off` disables |
| `SENTRY_DSN` | ➖ | optional — server error monitoring; unset = no-op |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | ➖ | Web Push public key (`npx web-push generate-vapid-keys`); unset = push off |
| `VAPID_PRIVATE_KEY` | ➖ | Web Push private key (server secret); pair of the public key above |
| `VAPID_SUBJECT` | ➖ | `mailto:` or `https:` contact URL required by push services |

Additional settings:

| Variable | Required | Notes |
|---|---|---|
| `APP_ENCRYPTION_KEY` | ➖ | encrypts secrets stored in the database (the Settings ▸ AI key); falls back to `BETTER_AUTH_SECRET` |
| `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_TOKEN` | ✅ (first run, production) | the only email allowed to create the first admin, and the one-time token typed on that screen; remove both after the first account exists |
| `PORT` | ➖ | listening port, default `3000` |
| `SASTRA_CLOUD_INSTANCE_ID` / `SASTRA_CLOUD_MANAGEMENT_SECRET` / `SASTRA_CLOUD_ACCOUNT_URL` | never for self-hosting | set only by the Sastra Cloud control plane; leave unset |

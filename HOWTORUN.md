# How to run Sastra locally

## Prerequisites
- **Node 22+** and **pnpm 10** (`corepack enable` will pin the right pnpm)
- **Docker** (for local pgvector-enabled Postgres + Mailpit)

## First-time setup

```bash
# 1. Start local services: pgvector/Postgres (5433) + Mailpit + MinIO (file storage)
docker compose up -d
#    Mailpit web UI (catches all outgoing email):  http://localhost:8025
#    MinIO console (S3-compatible storage, dev):    http://localhost:9001
#       login: minio / minio12345  (bucket "sastra-files" is auto-created)

# 2. Create your env file (defaults already point at the local containers)
cp .env.example .env

# 3. Install dependencies
pnpm install

# 4. Create the database schema, then seed baseline data
pnpm db:migrate     # applies migrations in ./drizzle
pnpm db:seed        # seeds project roles + the Standup Bot user

# 5. Run the dev server
pnpm dev            # http://localhost:3243

docker compose up -d && pnpm db:migrate && pnpm db:seed && pnpm dev
```

## First login
On a fresh database, open **http://localhost:3243** — you'll be redirected to
`/login`, which shows a **"Create the first admin"** form (because no accounts
exist yet). Create your admin account and you'll land on the dashboard.

After that, `/login` is a normal sign-in (password **or** "Email me a magic link").
Magic-link and other emails are caught by **Mailpit** at http://localhost:8025 —
click the link there to sign in.

## Everyday commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run the app (hot reload) |
| `pnpm build` && `pnpm start` | Production build + serve |
| `pnpm db:generate` | Generate a new migration after editing the schema |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:seed` | Re-seed baseline data (idempotent) |
| `pnpm db:studio` | Open Drizzle Studio (browse the DB) |
| `pnpm exec tsc --noEmit` | Type-check |

## Resetting the database

```bash
docker compose down -v   # removes the Postgres volume (all data)
docker compose up -d
pnpm db:migrate && pnpm db:seed
```

## Run the production image (what Coolify will run)

```bash
docker build -t sastra .
docker run --rm -p 3000:3000 --env-file .env \
  -e DATABASE_URL="postgres://ppp:ppp@host.docker.internal:5433/sastra" \
  -e SMTP_HOST="host.docker.internal" \
  sastra
# The container applies DB migrations on start, then serves on :3000.
```

## Troubleshooting

- **Port 5432/5433 in use** — another Postgres is running. Our compose uses host
  port **5433**; if that's taken too, change it in `docker-compose.yml` and
  `DATABASE_URL` in `.env`.
- **Emails not arriving** — they don't go to real inboxes in dev; check Mailpit at
  http://localhost:8025.
- **`DATABASE_URL is not set`** — make sure `.env` exists and `docker compose up`
  is running.
- **Migration says `vector` is unavailable** — recreate or upgrade the local
  Postgres service from `docker-compose.yml`; ordinary `postgres:17` images do
  not include the extension required by Wiki semantic search.
- **Stuck login / want a fresh admin** — reset the DB (see above), or in
  `pnpm db:studio` set a user's `role` to `admin`.

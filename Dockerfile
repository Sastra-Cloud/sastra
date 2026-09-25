# syntax=docker/dockerfile:1

# ── Base ──────────────────────────────────────────────────────────────────────
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# ── Dependencies (all, for build) ─────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ── Build, then prune to prod deps ────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build
RUN pnpm prune --prod

# ── Runner ────────────────────────────────────────────────────────────────────
FROM base AS runner
# Release identity, reported by /api/version and /api/ready. The release
# workflow passes these; a plain `docker build` leaves them blank and the app
# falls back to package.json's version.
ARG SASTRA_VERSION=""
ARG SASTRA_REVISION=""
ENV SASTRA_VERSION=$SASTRA_VERSION
ENV SASTRA_REVISION=$SASTRA_REVISION
ENV NODE_ENV=production
ENV PORT=3000
# curl is needed for the container HTTP healthcheck (node:slim ships neither curl nor wget).
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/.next ./.next
COPY --chown=node:node --from=build /app/public ./public
COPY --chown=node:node --from=build /app/package.json ./package.json
COPY --chown=node:node --from=build /app/next.config.ts ./next.config.ts
COPY --chown=node:node --from=build /app/drizzle ./drizzle
# Help documentation is read at request time by the assistant's search_help_docs
# tool (the build is not `output: standalone`), so ship the markdown into the image.
COPY --chown=node:node --from=build /app/content ./content
COPY --chown=node:node --from=build /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --chown=node:node --from=build /app/scripts/bootstrap-workspace.mjs ./scripts/bootstrap-workspace.mjs
COPY --chown=node:node --from=build /app/lib/projects/default-templates.json ./lib/projects/default-templates.json

EXPOSE 3000
USER node
# Apply migrations and fill only missing baseline workspace data, then start.
# Set MIGRATE_ON_START=false when a release step (pre-deploy command, release
# Machine) runs `node scripts/migrate.mjs && node scripts/bootstrap-workspace.mjs`
# instead, so cold starts stay fast and only one process migrates. Call next
# directly so pnpm/corepack isn't needed at runtime.
CMD ["sh", "-c", "if [ \"${MIGRATE_ON_START:-true}\" != \"false\" ]; then node scripts/migrate.mjs && node scripts/bootstrap-workspace.mjs; fi && exec node_modules/.bin/next start"]

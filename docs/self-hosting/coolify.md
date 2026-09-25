# Coolify

Sastra runs well on [Coolify](https://coolify.io). Two options:

1. **Compose**: paste `deploy/compose/docker-compose.yml` as a Docker Compose
   resource and set the variables from `deploy/compose/.env.example` in the
   Coolify UI. Coolify handles HTTPS and the domain.
2. **Dockerfile build pack** from a Git checkout of this repository, with a
   separate Coolify Postgres resource. This is how the maintainers run their own
   instance; the full walkthrough, including verified TLS to Postgres, backups,
   scheduled tasks, and push notifications, is in [DEPLOY.md](../../DEPLOY.md).

Either way:

- Set `BETTER_AUTH_URL` to the exact public HTTPS URL.
- Add one **Scheduled Task** that runs every minute:
  `curl -fsS -X POST "http://127.0.0.1:3000/api/cron/tick" -H "Authorization: Bearer $CRON_SECRET"`
- Use `/api/health` as the container healthcheck.

---
title: Self-hosting and database upgrades
category: "Settings"
roles: [admin, super_admin]
keywords: [self-hosting, PostgreSQL, database, upgrade, backups, pgvector, Neon, Docker, Coolify]
order: 95
summary: Sastra 0.2.0 requires PostgreSQL 18 or newer. Preserve existing workspace data through tested backups and the documented database upgrade procedure.
---

# Self-hosting and database upgrades

Sastra 0.2.0 requires **PostgreSQL 18 or newer** with the `vector` extension.
The Docker Compose database pins PostgreSQL 18.6 and pgvector 0.8.6 for Intel
and ARM. Neon manages its own patch availability, so its actual version may differ.

If your installation uses PostgreSQL 17, your operator must back up and restore
the existing database into a new PostgreSQL 18 volume before starting Sastra
0.2.0. Replacing the database image does not convert older data files. Preserve
the original volume and a private backup for at least seven days; do not reset
or reseed your workspace.

For an 18.x patch update, preserve the existing volume, database configuration,
and TLS settings. Test a fresh backup and the vector extension update in an
isolated database first. Keep daily private backups with at least seven daily
copies. These are operator tasks; the in-app assistant cannot perform them.

Follow the [PostgreSQL upgrade guide](https://github.com/Sastra-Cloud/sastra/blob/main/docs/self-hosting/postgresql-upgrade.md)
for the maintenance procedure, verification, and recovery. The
[self-hosting guides](https://github.com/Sastra-Cloud/sastra/tree/main/docs/self-hosting)
cover Compose, Coolify, Railway, Neon, and environment settings.

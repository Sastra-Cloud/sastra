---
title: Self-hosting
category: "Settings"
roles: [admin, super_admin]
keywords: [self-hosting, PostgreSQL, database, installation, backups, pgvector, Neon, Docker, Coolify]
order: 95
summary: Self-hosted Sastra requires PostgreSQL 18 or newer with the vector extension, plus app hosting, file storage, email, and a scheduler.
---

# Self-hosting

Sastra requires **PostgreSQL 18 or newer** with the `vector` extension.
The Docker Compose database pins PostgreSQL 18.6 and pgvector 0.8.6 for Intel
and ARM. Neon manages its own patch availability, so its actual version may differ.

Your operator also provides app hosting, file storage, email, a scheduler, and
backups. The in-app assistant cannot configure this infrastructure.

The [self-hosting guides](https://github.com/Sastra-Cloud/sastra/tree/main/docs/self-hosting)
cover Compose, Coolify, Railway, Neon, and environment settings.

# PostgreSQL requirements

Sastra requires **PostgreSQL 18 or newer** with the `vector` extension.
Startup and migration checks verify the database version before proceeding.

The [Docker Compose bundle](./compose.md) pins PostgreSQL 18.6 and pgvector
0.8.6 for Intel and ARM. Its data volume mounts at `/var/lib/postgresql`, with
`PGDATA=/var/lib/postgresql/18/docker`.

For managed Postgres, select PostgreSQL 18. The provider controls minor patch
availability. See the [Neon guide](./neon.md) for pooled runtime connections,
direct migration connections, and verified TLS.

Check the server and extension versions with:

```sql
SHOW server_version;
SELECT extversion FROM pg_extension WHERE extname = 'vector';
```

Sastra's migrations enable the extension automatically. The migration role
must have permission to create it, and the server must provide pgvector.
See the [self-hosting guides](./README.md) for installation and configuration.

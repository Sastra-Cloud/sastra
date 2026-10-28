# Build memory and cache policy

These settings bound build work on the shared Coolify host. They do not impose a total container memory limit.

- Keep type checking enabled; a compiler failure must fail a checked build.
- Use two Next.js page workers and at most two concurrent pages per worker. This trades build speed for lower peak memory; it does not cap native Turbopack threads.
- Build JavaScript processes use a 2048 MiB old-generation heap. Native allocations, subprocesses, and filesystem cache also count toward host memory.
- Package caches and Next's `.next/cache/turbopack` persist between image builds. The runtime does not receive those BuildKit cache mounts. Caches can be deleted and a cold build must still succeed.
- Serialize image builds on the host and enforce a separate builder/container memory budget. These deployment settings are reviewed separately from source changes.

Validate on Linux using isolated data and no production credentials. Record the complete container's peak memory, build duration, exit status, and cold/warm cache state. A faster warm build alone does not establish lower peak memory.

`pnpm build` runs route type generation, tsrs, bundling, and a final tsrs check. `pnpm typecheck:tsc` retains the official TypeScript comparison. tsrs is pinned to `0.20.0-ts7.1.0-beta` (TypeScript 7.1 beta) with two checkers; its fast preset is not enabled.

Only compiler caches are mounted; authenticated fetch caches stay inside their own image build.

The default remains Turbopack, with experimental garbage collection enabled. The cold Linux build passed with a 4 GiB cgroup limit, peaking at 4,087,910,400 bytes (3.81 GiB), in 157 seconds with zero OOM events. This does not establish a savings percentage against the production build. Both Turbopack and the Webpack memory-optimization trial exceeded 3 GiB; do not configure a 3 GiB builder for this app. Leave additional host headroom for the image builder and live services, and prefer a separate build host when that headroom is unavailable.

## GitHub Actions usage

Superseded runs on the same PR or ref are cancelled. Expensive application jobs wait until a draft PR is marked ready; `ready_for_review` starts the checks, and later commits rerun them. Main pushes retain full validation. Job timeouts bound stalled work. CI compiles the application once, inside the production-image smoke job after lint/tests pass. The daily security monitor audits each lockfile without installing a dependency tree. Closed PR caches are deleted while main caches remain reusable.

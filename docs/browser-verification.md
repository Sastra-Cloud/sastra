# Real-browser verification

Unit tests run in Node. Some failures only show in a browser: a chat that lands
mid-history after the keyboard opens, a page that keeps its scroll position, a
Safari-only layout. This suite exercises those against a production build.

## Run it

```bash
export SASTRA_DISPOSABLE_DATABASE=true
export SASTRA_BROWSER_DATABASE_SERVER_URL="postgres://USER:PASSWORD@localhost:5432/postgres"
pnpm exec playwright install chromium webkit   # once
pnpm test:browser
```

- `pnpm test:browser --project chromium-phone` runs one browser. Projects are
  `chromium-desktop`, `chromium-phone`, and `webkit-phone`.
- `SASTRA_BROWSER_REUSE_BUILD=true` skips the production build when `.next` is
  already current.
- `pnpm test:browser:performance` prints an informational timing report (below).
- `pnpm test:browser:guards` checks the safety guards without a browser.

The server must be a **local PostgreSQL 18 with pgvector** that can create
databases (for example the Docker `pgvector/pgvector:0.8.6-pg18-bookworm` image).
Set `SASTRA_BROWSER_DATABASE_SERVER_URL` explicitly; the runner never reads your
normal development or production environment. Run the suite from a clean
checkout or worktree without local environment files, as CI does. Keep your
usual development checkout and its `.env` file in place.

## What it does

1. Creates a new database named `sastra_browser_<random>`, migrates it, and runs
   the workspace bootstrap.
2. Builds the app and starts `next start` on a free loopback port with a minimal
   environment. Nothing from your shell (keys, tokens) is passed on, and random
   secrets are created for the run.
3. Puts a throwaway self-signed HTTPS proxy in front. The app sends
   `upgrade-insecure-requests` and HSTS exactly as in production, so WebKit
   cannot use plain HTTP.
4. Creates one administrator through the real Better Auth sign-up endpoint (with
   a random email and password), completes workspace setup, and adds one
   project, 14 tasks, and two long chat histories.
5. Runs the scenarios, then stops the server, drops the database, and deletes the
   temporary directory (cookies, certificate, results).

## Safety guards

The runner refuses to start unless all of these hold, and the provisioning step
repeats them before writing anything:

- `SASTRA_DISPOSABLE_DATABASE=true` is set explicitly.
- The Postgres server and the database are on this machine (loopback only).
- The database name matches `sastra_browser_*`.
- No `.env`, `.env.local`, `.env.production`, or `.env.production.local` file
  is present, because `next start` would load it. There is no override that
  lets production credentials or provider settings into a fixture run.

`/api/dev/agent-login` is not used and is not available in production builds.
Credentials live only in process environments for the run. No screenshots,
traces, or videos are recorded.

## Scenarios

| File | Protects |
|---|---|
| `chat.spec.ts` | A reopened chat shows the newest message and keeps it through window resizes. The composer is reachable and typeable in a short window. Send shows the message at once and keeps exactly one saved copy. A failed send restores the draft. |
| `pull-refresh.spec.ts` | Page pulls work with non-cancelable movement events. Chat-header and transcript-top pulls fetch fresh data and retain the draft, including a pending refresh; history scrolling does not trigger refresh. |
| `dashboard.spec.ts` | Home tasks are visible and open for editing. A slow then failing badge feed does not hide or reset tasks. A route change records its own timing. |
| `navigation.spec.ts` | A normal link starts at the top, and Back restores the previous position. Core pages never scroll sideways. |
| `observability.spec.ts` | What the page sends when reporting is on is only allowlisted numbers, with no ids, names, or paths. |

Assertions wait on observable state (DOM geometry, text, requests). There are no
fixed sleeps and no timing thresholds. A phone viewport with a `shortPhone`
height is emulation; it is **not** proof of a physical iOS keyboard. Check that
on a real device when the change touches keyboard behavior.

Home's late-loading review list follows the project links, and setup guidance
follows the work area. They can arrive without pushing those links or the tasks
down the page. The Back scenario checks the same restored-position tolerance in
Chromium and WebKit.

Limits: the server-streamed parts of Home (setup checklist, manager review list)
cannot be delayed or failed by intercepting a separate browser request. Focused
component tests cover streaming, failure recovery, and snapshot settlement;
the browser suite intercepts the badge feed's own request.

## Performance report

`pnpm test:browser:performance` loads Home, one project page, and one chat in
Chromium, with and without a throttled network (slow 4G) and CPU (4x slower),
on a first (cold) visit and a repeat (warm) visit. It prints medians for TTFB,
FCP, LCP, the `visible` and `ready` markers, request count, and bytes (from the
browser's own Resource Timing). It writes `performance.json` and
`performance.md` to `browser-performance-report/` (git-ignored; override with
`SASTRA_BROWSER_REPORT_DIR`). `SASTRA_PERFORMANCE_RUNS` sets runs per row
(default 3).

It never fails because a number is high. Timings depend on the machine, so
compare two runs of this command on the same machine, before and after a
change. It is not a benchmark and not a gate. Pages are served over plain HTTP
on loopback, so TLS cost is excluded.

## Useful-work markers

The app writes `sastra:<name>` User Timing measures in every browser, with
`detail` of `{ route, navigation }`:

- `dashboard-tasks-visible`, `chat-messages-visible`: first paint of that
  content, from Element Timing. Chromium only; absent elsewhere.
- `dashboard-tasks-ready`, `chat-composer-ready`: React has hydrated that part,
  so it responds to taps and typing.

They are measured from the start of the navigation (a page load, or the click of
an in-app link). A new navigation discards work still pending from the last one.
If you set `SASTRA_PERFORMANCE_MONITORING=true` on a deployment they are also
sent anonymously; see `docs/self-hosting/environment.md`.

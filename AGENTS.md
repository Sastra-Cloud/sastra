When searching code, use the built-in Grep and Glob tools instead of
piping shell commands through xargs, $(...), or find -exec.
<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AI context index

Start with `.ai/repo-map.md` for a compact map of routes, schema exports,
commands, and domain files. Load `.ai/domains/<slug>.md` only when the task
touches that area. The `.ai/` files are generated; do not edit them by hand.
After changing routes, exported symbols, schema files, or major domain
structure, run `pnpm ai:map` and include the generated changes.

Claude-specific path rules live in `.claude/rules/`. Codex should also consult
the matching rule manually when touching those paths.

# Help documentation upkeep

`content/help/*.md` is the single source of truth for user-facing help. It powers
two surfaces, so it must stay accurate as the product changes:

- the in-app **Help** page (`app/(app)/help/page.tsx` +
  `components/help/help-browser.tsx`), and
- the in-app **assistant**, which is grounded in these docs through the
  `search_help_docs` tool and a topics index in its system prompt
  (`lib/assistant/tools.ts`, `lib/assistant/prompt.ts`, `lib/help/content.ts`).

The assistant only describes features the docs (or a live tool result) confirm,
and it tells users a feature "may not exist" when the docs don't cover it. So
**whenever you add, change, rename, or remove a user-facing feature, update the
matching `content/help/<topic>.md` in the same change** — add a new file for a new
feature area, and keep the `summary`, `keywords`, and `roles` frontmatter current
(they drive assistant search, the topics index, and the role badge). Stale docs
make the assistant give users wrong or "that feature doesn't exist" answers. Full
details in `.claude/rules/help-docs.md`.

# Optimistic UI and action feedback

Every new or changed user-facing mutation must define its feedback behavior as
part of the feature, not as follow-up polish. The default is optimistic UX: when
the expected result is predictable and reversible, update the visible client
state immediately, let the server action continue in the background, then
reconcile with the server result.

Use these rules:

- For creates, edits, toggles, reorders, assignments, and status changes, update
  the affected UI immediately. Use temporary IDs for newly created records when
  necessary.
- For destructive actions, obtain any required confirmation first, then remove
  the item from the UI immediately while the confirmed server action runs.
- Snapshot enough prior state to roll back exactly if the action fails. Show a
  clear error toast or inline error after rollback and preserve recoverable user
  input.
- Reconcile successful actions with canonical server data using the returned
  result and/or `router.refresh()`. Do not leave temporary records or stale
  derived totals behind.
- Prevent duplicate submission for the action in flight, but do not disable
  unrelated controls or block the whole surface unnecessarily.
- Use truthful pending/progress UI instead of pretending completion when the
  outcome is not predictable or locally reversible. Examples include file
  uploads, imports, AI generation/extraction, email sending, external API work,
  payment processing, and server-computed bulk operations. Show determinate
  progress when available; otherwise use a focused spinner or pending label.
- Keep review-first and confirmation requirements for sensitive finance,
  permissions, correspondence, and other high-impact actions. Optimistic UI
  must never bypass authorization, validation, or explicit-send boundaries.
- Add purposeful motion only when it clarifies the state change (for example a
  short item enter/exit transition). Respect reduced-motion preferences and do
  not delay the actual action for decorative animation.

Prefer the shared patterns in `hooks/use-optimistic-action.ts`,
`hooks/use-prop-state.ts`, and `lib/actions/result.ts`. When adding a new client
mutation, keep `lib/actions/interaction-policy.ts` and its regression test
current so every action is explicitly classified as optimistic, confirmed
destructive, progress-based, navigation, or read-only.

Verification must exercise the immediate state, the settled success state, and
the failure/rollback state. For visible interaction changes, also follow the
browser workflow below and inspect at least one intermediate animation or
pending state when applicable.

# Organization portability

Sastra is deployed as one organization per instance. Never hard-code an
organization name, teammate, email/domain, language pair, territory, currency,
timezone, finance recipient, fund label, print location, or invoice identity in
application behavior. Read organization identity and operating defaults from
`workspace_settings`; secrets and provider credentials remain environment
variables.

AI features must use the shared workspace-context builder so active users and
organization aliases/domains are treated as internal. New projects snapshot
workspace defaults, while existing project overrides always win and must not be
silently rewritten after a Settings change. Baseline deploy bootstrapping may
insert missing roles/templates/system rows but must never overwrite admin edits.

# GitHub handoff / deployment verification

When the user asks to commit, merge, push, or get changes onto GitHub for
Coolify:

1. Run `git status --short --branch` and identify any uncommitted local changes.
2. If there are uncommitted local changes, do not say "everything is pushed" or
   "Coolify can see it." First decide whether those local changes are part of
   the user's requested update. If they are, commit and push them. If they are
   not, explicitly tell the user they remain local and are not deployed.
3. Commit all intended changes before saying they are on GitHub. Uncommitted
   files are local only and Coolify cannot deploy them.
4. Push the target branch, usually `main`, with `git push origin main`.
5. Verify GitHub's remote ref after pushing:
   - `git rev-parse HEAD`
   - `git ls-remote origin refs/heads/main`
6. Only tell the user the intended changes are merged/pushed when there are no
   relevant uncommitted local changes left and the remote SHA matches the local
   `HEAD`. Include the short SHA in the response so Coolify deploy logs can be
   compared against it.

# Browser automation

Use browser automation only when a change has meaningful visual or interaction
risk: new or substantially reworked UI, responsive layout, theming, motion,
multi-step interactions, or a reported visual regression. Do not run it by
default for every UI-adjacent task. Small copy changes, calculation fixes,
field-value corrections, and minor extensions of an established component
pattern should use focused tests, type checking, and code inspection unless
there is a specific reason to suspect a visual problem.

When browser inspection is warranted, use `pnpm agent-browser:open` for the
authenticated local session. It opens `/api/dev/agent-login`, which is only available in
`NODE_ENV=development` and only when `AGENT_BROWSER_DEV_TOKEN`,
`AGENT_BROWSER_DEV_EMAIL`, and `AGENT_BROWSER_DEV_PASSWORD` are configured.
Use `pnpm agent-browser -- <command>` or `pnpm agent-browser <command>` to pass
through arbitrary `agent-browser` commands.

## Authenticated page geometry

The signed-in app has one canonical content canvas. `AppShell` owns the centered
`max-w-[88rem]` wrapper inside the responsive main padding; pages under
`app/(app)` must not create a competing outer `mx-auto`/`max-w-*` shell.

- Use `PageShell` for page-level vertical rhythm.
- Use `ContentColumn` *inside* the page shell for deliberately narrow forms,
  correspondence threads, chat, or prose. Keep primary page headers and heroes
  on the full app canvas.
- Nested layouts such as projects, settings, and wiki inherit the same canvas.
  Loading, empty, and error states must inherit it too.
- Keep the established navigation breakpoints: mobile below `lg`, compact rail
  at `lg`, expandable sidebar at `xl`. Use content-driven breakpoints for inner
  grids instead of changing the outer page width.
- During responsive review, compare `[data-app-canvas]` against `/projects` at
  the same viewport and sidebar state. Check both collapsed and expanded sidebars
  and verify there is no document-level horizontal overflow.
- `RouteScrollManager` owns authenticated route scroll behavior. Forward
  navigation to a different pathname starts at the top of the new screen;
  browser Back/Forward keeps its restored position, and hash links keep their
  target. Do not add page-specific scroll-reset effects or opt out with
  `scroll={false}` without a documented interaction reason.

## UI/UX implementation and review workflow

Use Superdesign only when a task genuinely needs design exploration or a new
visual direction. Do not use it for minor UI changes, bug fixes, or small
extensions of an established interface pattern.

For substantial UI/UX design, polish, responsive layout, dark-mode, or visual
regression work, inspect the running app with agent-browser before calling the
work done. Skip browser automation for small changes that preserve the existing
layout and interaction model, including enabling a field, changing copy,
correcting a displayed value, or making a minor control adjustment. Code-level
checks are sufficient for those changes. Use judgment: run the browser when it
can answer a real visual or interaction question, not as a ritual.

When the browser-review threshold is met, use this flow:

1. Make sure the local app is already running on `http://localhost:3243`.
2. Open an authenticated session:
   - `pnpm agent-browser:open`
   - To start on a specific route, use `pnpm agent-browser open /dashboard` or
     another authenticated path.
3. Exercise the changed routes in both themes:
   - `pnpm agent-browser set media light`
   - `pnpm agent-browser set media dark`
4. Check at least one desktop and one mobile viewport:
   - `pnpm agent-browser set viewport 1440 1000`
   - `pnpm agent-browser set viewport 390 844`
5. Capture screenshots into `/tmp`, not the repo:
   - `pnpm agent-browser screenshot /tmp/sastra-ui-review/dashboard-light.png`
6. Review screenshots for clipped text, horizontal overflow, hidden primary
   actions, unreadable contrast, crowded touch targets, tab overflow, and
   light/dark theme mismatches.
7. For chat or planner flows, verify the real interaction surface: composer
   visible, buttons reachable, messages/empty states framed correctly, and no
   mobile content clipped off-screen.

## Agent-browser lessons learned

Avoid repeating the same failing browser command. If `pnpm agent-browser ...`
hangs and then fails with `ENOTFOUND registry.npmjs.org`, the wrapper tried to
use `npx` and the CLI was not available locally. In that case, rerun the needed
agent-browser command once with network-capable execution/approval instead of
looping on sandboxed retries. If this becomes frequent, install/cache the CLI or
set `AGENT_BROWSER_BIN` to a local binary.

Use the project wrapper for authenticated local app review. Raw
`npx agent-browser ...` does not load this repo's `.env` and may open the app
unauthenticated. Start with `pnpm agent-browser:open /chat` or
`pnpm agent-browser open /chat`, then use screenshots/snapshots against that
session. If a raw `npx` command is necessary because the wrapper cannot resolve
the package inside the sandbox, remember it will not perform the dev-login setup
for you.

The dev-login flow has two different failure modes:

- `{"error":"Unauthorized"}` means the dev token header did not reach
  `/api/dev/agent-login`. The wrapper should set headers with
  `agent-browser set headers <json>` before opening the dev-login URL. Do not
  assume `--headers` works when appended after the URL or embedded inside a
  `batch` command; the CLI can treat it as page input or split the JSON.
- `{"error":"Agent browser dev login failed."}` means the token was accepted,
  but Better Auth could not sign in with `AGENT_BROWSER_DEV_EMAIL` and
  `AGENT_BROWSER_DEV_PASSWORD`. Check that the configured email exists in the
  local DB and has a credential/password account. If the user asks to create
  the local login, create it through Better Auth signup using the configured
  `.env` password rather than hand-writing a password hash. For this invite-only
  app, seed a local pending invitation for that email first when needed.

When creating or checking the local dev login, never print the configured email,
password, token, password hash, session token, or cookie. It is fine to print
boolean diagnostics such as `userExists`, `credentialAccount`, `isActive`, and
the HTTP status/redirect location of `/api/dev/agent-login`.

Prefer one `batch --bail` command for visual review instead of many separate
agent-browser invocations. Each separate command may re-enter the `npx` path,
while a batch can set viewport, set theme, open routes, wait, and capture all
screenshots in one run.

When using `agent-browser batch`, prefer full URLs such as
`http://localhost:3243/projects/the-trinity/print` inside `open` steps. Relative
paths can be treated as hostnames by the underlying CLI in some batch contexts
and fail with `net::ERR_NAME_NOT_RESOLVED`, even after an authenticated
`pnpm agent-browser:open /route` succeeds.

Keep browser commands serialized. Do not start another agent-browser command
while a prior screenshot/batch command is still running. Poll the running command
first, then retry or simplify after it exits.

Use exact shell quoting. Wrap batch steps in quotes, and quote Next route file
paths that contain parentheses or brackets when using shell tools. Unquoted route
paths like `app/(app)/projects/[slug]/page.tsx` can fail in `zsh` before the
actual tool runs.

When a visible click fails because a sticky header or side rail covers the click
point, do not keep retrying the same `find ... click`. Use a screenshot or DOM
snapshot to confirm the element, then click with a more direct selector/DOM eval
or coordinates. Re-screenshot after the interaction so the result is verified
visually.

The in-app browser plugin can be a useful fallback, but if its bridge errors
before setup, stop spending time there and return to the project wrapper. For
this app, the reliable path is still `pnpm agent-browser:open` followed by
`pnpm agent-browser batch --bail ...`.

Always inspect the saved screenshots, not only the CLI success output. A
successful screenshot command proves capture worked; it does not prove the UI is
readable, unclipped, correctly themed, or showing the intended state.

For motion work, verify both the final state and at least one intermediate
state. Route changes can remount server-rendered pages before a client-side exit
animation is visible. If a sidebar/accordion should animate closed before
navigating away, delay the client-side `router.push` only for ordinary left-click
navigation, and preserve native behavior for modifier-clicks, middle-clicks,
and explicit new-tab targets.

Do not commit local skill-install artifacts unless the user explicitly asked for
skill installation changes. In this repo, `.agents/**` is local agent tooling and
should not be linted or deployed as app code. If it appears in `git status`, leave
it untracked unless it is directly relevant to the requested change.

Use this core route set for broad UI reviews unless the user narrows scope:

- `/dashboard`
- `/projects`
- a representative project detail route, including `/chat`, `/tasks`,
  `/rights`, `/budget`, and `/members`
- `/chat`
- `/standups`
- `/settings/profile`, `/settings/notifications`, `/settings/team`,
  `/settings/standups`, and `/settings/ai`
- `/help`

Security constraints:

- The agent-browser dev login is for local development only. Never make it
  available in production behavior.
- Do not print or commit `AGENT_BROWSER_DEV_TOKEN`,
  `AGENT_BROWSER_DEV_EMAIL`, or `AGENT_BROWSER_DEV_PASSWORD`.
- Keep verification screenshots and temporary review artifacts under `/tmp`
  unless the user explicitly asks to add them to the repo.

# Email intake / print correspondence lessons learned

Correspondence is sensitive operational data. Hide correspondence navigation and
project/thread links from members, and enforce `requireRole("manager")` on
`/correspondence` pages themselves; UI hiding alone is not access control.

Forwarded/backfilled messages need to be treated as correspondence from the
original email, not from the teammate who forwarded it. Parse forwarded
`From`/`To`/`Cc` headers from plain text and HTML bodies, include original
participant names when addresses are missing, and use those hints for project,
publisher, printer, and direction/attribution decisions.

Printer quotes often arrive as plain email text with multiple quantity tiers
rather than as one invoice PDF. Parse each tier into a suggested quote for
review, link by printer contact/domain/name plus project text, and keep a
manager-only reprocess action for captured threads when initial ingestion missed
the forwarded context. Never auto-accept extracted quote data.

When reprocessing a printer quote email, linking the correspondence card is not
enough. If the message has a linked project, concrete quote tiers/specs, and no
existing print run to attach to, create an internal print run from the parsed
email, attach the thread to that run, and save the tiers as suggested quotes for
manager review.

Do not notify anyone for messages landing in the capture mailbox. Captured email
belongs in **Correspondence**, not the bell: arrival alone raises no in-app
notification and never sends a workflow email about an email. Unlinked mailbox
noise such as provider security alerts stays in the `Other email` inbox filter.
Only the specific work an email produces — a task suggestion, a review request,
an external follow-up — may raise its own notification. The bell is reserved for
high-signal work alerts, so `email_received` is excluded from it and from the
unread count (`listBellNotifications` in `lib/notifications/queries.ts`).

Print and finance email actions must stay review-first: showing a draft is not
permission to send. Keep the recipient/CC list visible, allow per-email CC edits,
and require an explicit user confirmation immediately before sending.

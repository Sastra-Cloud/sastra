---
paths:
  - "app/(app)/**"
  - "components/**"
  - "hooks/**"
description: "UI/UX changes require authenticated browser verification"
---

# UI Review

For UI, visual polish, responsive layout, dark mode, or interaction changes, inspect the running app before calling the work done.

## Required workflow

- Use the project wrapper, not raw `npx`: `pnpm agent-browser:open` or `pnpm agent-browser open /route`.
- Verify at least one desktop viewport and one mobile viewport.
- Verify light and dark media.
- Save screenshots under `/tmp`, never in the repo.
- Inspect the screenshots manually for clipped text, horizontal overflow, hidden actions, contrast problems, crowded touch targets, and mobile content cut off-screen.
- For authenticated routes, measure `[data-app-canvas]` and confirm it matches
  `/projects` at the same viewport and sidebar state. Route pages must not add a
  competing outer width.
- Exercise the responsive boundaries at 390, 640, 768, 1024, 1280, 1536, and
  1920 CSS pixels when the change affects the app shell or page geometry. Check
  both collapsed and expanded sidebar states where the sidebar is available.
- For navigation changes, scroll a long route well below its header, follow a
  normal in-app link, and confirm the destination starts at `window.scrollY ===
  0`. Also confirm browser Back restores the prior position and hash navigation
  still reaches its target.

## Preferred command shape

Use one serialized `batch --bail` command when possible. Do not start a second agent-browser command while the first is still running.

```bash
pnpm agent-browser batch --bail "set viewport 390 844" "set media dark" "open /dashboard" "wait 1200" "screenshot /tmp/sastra-ui-review/dashboard-mobile-dark.png"
```

If `agent-browser` falls back to network-dependent `npx` and fails with `ENOTFOUND registry.npmjs.org`, request network-capable execution once instead of retrying the same failing command.

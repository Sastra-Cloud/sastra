# Sastra interface system

Sastra is an operational publishing workspace. The interface should feel calm,
trustworthy, and familiar enough to disappear while someone coordinates work.
Editorial character marks identity and page context; it does not decorate every
control or data surface.

## Typography

- Geist is the default for body text, controls, labels, data, card titles,
  dialogs, sheets, and section headings.
- Fraunces is reserved for the Sastra brand, top-level page titles, and rare
  identity moments such as a project monogram.
- Keep operational headings compact and use balanced wrapping. Prose should stay
  near 65–75 characters per line.

## Surfaces and color

- Use borders and spacing for routine grouping. `surface-shadow` is a restrained
  2px/8px elevation, never a wide halo paired with a hairline border.
- Brand orange is for primary action and current selection. Violet, success,
  warning, destructive, and info colors communicate state rather than decoration.
- Page heroes may carry one subtle brand accent. Do not repeat gradient rules,
  icon tiles, or serif headings inside every operational card.

## Page geometry and breakpoints

- The authenticated app shell owns one fluid content canvas: it fills the space
  left after navigation and the responsive page padding, with no global maximum
  width. Route pages and nested layouts must not add a competing outer
  `mx-auto` or `max-w-*` container.
- Wide screens show more useful work, not bigger type. Dense data (tables,
  boards, schedules, matrices) uses the full canvas; collections add columns by
  container width; reading, writing, and forms keep readable inner widths
  (prose about 65–75ch, forms about 32–48rem); side rails stay bounded at
  roughly 22–28rem.
- Prefer CSS grid and container queries (`@container/name` with
  `@[76rem]/name:` variants) for layout inside the canvas, as the Wiki
  workspace does. Viewport breakpoints stay for global navigation. Render a
  stateful form once and reposition it with CSS rather than mounting separate
  breakpoint copies.
- Use `PageShell` for vertical rhythm. Use `ContentColumn` inside that shell
  when a form, thread, chat, or reading surface benefits from a narrower line
  length; keep page heroes and primary headers on the full app canvas.
- Preserve the shell transitions already established by the navigation: mobile
  below `lg`, the compact desktop rail at `lg`, and the expandable sidebar at
  `xl`. Component grids may use content-driven breakpoints within that canvas.
- Test layout changes at mobile, tablet, compact-desktop, expanded-sidebar, and
  large-desktop widths. The app canvas must match Projects at the same viewport
  and sidebar state, and no route may introduce document-level horizontal
  overflow.

## Interaction

- On coarse pointers, interactive controls have at least a 44px hit target.
- Forward navigation to a different app screen opens at the top. Browser
  Back/Forward returns users to their prior position, and in-page hash links
  still move to their named target.
- Every mutation defines immediate, settled, and rollback feedback. Finance,
  correspondence, permissions, and external sends remain review-first.
- Empty states explain what happens next. Errors offer retry and a safe route.

## Motion

- Press feedback: 100–150ms. State changes: 150–220ms. Layout continuity:
  220–300ms, using `cubic-bezier(0.22, 1, 0.36, 1)` where appropriate.
- Motion communicates state: completion, selection, insertion/removal, loading
  handoff, or continuity between a project card and its workspace.
- Do not orchestrate page-load reveals or count recurring metrics up from zero.
  Content is visible before animation begins.
- Respect `prefers-reduced-motion`; no feature may depend on animation.
- Under reduced motion, movement and resizing apply at once while opacity and
  color still fade. Reduced motion means gentler, not absent, feedback.
- Navigation between routes does not animate its active indicator: the main
  nav and route tabs use a static pill. A sliding indicator would run on the
  main thread while the next screen renders. In-page tabs may still slide.
- Use the shared curve as `ease-settle` (or `var(--motion-ease)` in CSS)
  instead of retyping the cubic-bezier.

## Slower devices

- `lib/ui/device-tier.ts` sets `data-low-power` on `<html>` for devices with
  little memory or few cores, and for people who ask for reduced transparency.
- Every backdrop blur declares a plain fallback with the `low-power:` variant,
  for example `low-power:bg-background low-power:backdrop-filter-none`.
  Looping decorative animations add `low-power:animate-none`.
- The variant only removes decoration. No feature may depend on it.
- Animate `transform` and `opacity`. A value that ticks every second lives in
  its own small component so the screen around it does not re-render.
- Keep large libraries off screens that do not use them. Charts load their
  drawing code on demand (`components/portfolio/charts`), and `MotionProvider`
  wraps only the part of a screen that animates, never the root layout.
- Measure before and after with `pnpm test:browser:performance` (4x CPU
  slowdown). The React Compiler was trialled on 2026-11-14 and not adopted:
  at most 11% less main-thread time on one interaction, for a bundling step
  more than twice as long and about 3% more page JavaScript.

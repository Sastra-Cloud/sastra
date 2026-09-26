# New publishing team experience

Scope: existing Sastra routes. No signup, checkout, subscription infrastructure, production writes, or database migrations. Changes are local and have not been committed or deployed.

## Four review batches

- [x] **Onboarding, permissions, draft recovery.** Explicit visit/outcome checklist steps use saved workspace, project, invitation, task, and check-in data. Historical click flags cannot complete outcome steps. Personal dismissal and reset remain separate. Project creation shares every field and submission state across guided/single-page views, confirms method changes, and retains failed inputs. AI review survives returning to the conversation; AI/import requests recover from returned and thrown failures. Creation, membership, and Help links follow existing capabilities.
- [x] **Navigation and mobile layout.** Home and My Work share the started-first, manually ordered attention policy. Team planning groups Overview, Schedule, and Workload at existing URLs. Project headers retain explicit settings, move other operations into Project actions, and disclose secondary metadata. Guidance summaries disclose steps. Conversation headers own assistant shortcuts; project chat fits the available viewport. Warning text uses a separate tinted-surface token.
- [x] **Operational workflows.** Correspondence searches subjects and linked projects, returns stable 50-row pages with a lookahead row, and preserves category/filter state. Existing listThreads callers remain supported. Pipeline cells link to the shared task editor and expose status text. Schedule distinguishes missing dates from assessed projects. Standups, shared MoUs, episode search/empty states, donation navigation, Wiki, and publishing terminology have clearer entry points.
- [x] **Settings and cloud clarity.** Settings groups distinguish personal/shared controls. Setup discloses optional details. A shared timezone control preserves IANA values and validates on the server, with hydration-safe suggestions. Hosted seats include pending invitations; hosted AI presents credits and account/support guidance while self-hosted installations retain provider-dollar reporting. Affected forms retain labels, field errors, pending feedback, and recoverable input. Password and email-link requests have independent pending state and a persistent email result.

Matching Help documents and generated repository maps are included. Deep links and existing authorization/send/review boundaries are retained.

## Verification evidence

- Full Vitest run: **186 files, 1,175 tests passed**. Added tests cover truthful onboarding, guidance reset success/rollback, task ordering, all draft fields, member/manager/admin project controls in empty/populated fixtures, hosted/manual guidance, literal correspondence search, authorization, stable pagination, timezone validation/hydration, and accessible pipeline links. Existing hosted seat/credit and route-scroll policy tests also pass.
- TypeScript: passed. ESLint: zero errors, five existing warnings (theme-toggle, use-mobile, unused query/engine variables). `git diff --check`: passed.
- Production build: `pnpm build --webpack` passed. The default Turbopack build could not bind its CSS worker port in this execution environment, including an escalated attempt; webpack was used as the supported build fallback.
- Browser review used the authenticated local wrapper. Screenshots remain under `/tmp/sastra-ui-review`, outside the repository. Reviewed mobile 390×844 and desktop 1440×1000 in light/dark themes, plus compact/expanded/collapsed navigation.
- Projects and project chat had matching app-canvas widths and no document overflow at 390, 640, 768, 1024, 1280, 1536, and 1920 pixels. Project and global chat composers remained inside the viewport, with a header assistant shortcut and no floating launcher over Send.
- Live local member/manager journeys verified creation controls, readable membership with manager guidance, and the member redirect away from Correspondence. The local test account's original role was restored in a finally block. Administrator settings and onboarding were reviewed in the existing local workspace. Empty-workspace and hosted variations use test fixtures, not production observations.
- Creation browser checks preserved every field, including dates, across both presentations. Canceling the method-change confirmation kept the form. A blocked server-action request showed pending state, prevented switching while pending, then retained all input and enabled retry.
- A temporary localhost AI draft verified review edits across Back to chat / Return to review, pending feedback, failed-answer restoration, and confirmation before replacing a reviewed plan. Requests were intercepted before reaching the server/provider; the temporary draft was deleted.
- Profile checks verified field-level timezone validation, pending save feedback, retained name/timezone after a simulated network failure, and no timezone hydration mismatch. No profile save reached the server.
- Schedule's local projects lacked dates: the screen correctly reported zero assessed, with a request to add dates, rather than a success claim. Correspondence's local inbox was empty; pagination and multi-project search used database-query fixtures.

## Deliberate validation limits

No real email, AI generation, document extraction, financial approval, or production mutation was performed. Donations correctly stopped at the security checkpoint. Hosted copy/seat/credit behavior was fixture-tested; no hosted deployment was changed. The local workspace had no episodic project, pending import, or configured standup editor fixture, so those data-dependent states were inspected and built rather than presented as live end-to-end coverage. Back/Forward and hash behavior remain covered by the existing scroll-policy regression tests; shared navigation code was not replaced.

The development browser reports the existing React/CSP unsafe-eval debugging warning. The newly detected timezone-list hydration mismatch was fixed and regression-tested. Browser CLI sessions occasionally stalled/reset; fresh authenticated sessions completed the affected checks.

## Complete page-route inventory

“Build; no browser review” means compilation coverage, not a claim of visual inspection. Security- and data-dependent limitations are explicit. The complete API inventory remains in `.ai/routes.md`; no API route was added or removed.

| Route | Coverage |
| --- | --- |
| `/agenda` | Build; no browser review |
| `/agreements/[id]` | Build; no browser review |
| `/agreements` | Browser: desktop/mobile, light/dark |
| `/agreements/review/[importId]` | Build; no browser review |
| `/assistant` | Build; no browser review |
| `/chat/[channelId]` | Browser: desktop/mobile, light/dark |
| `/chat` | Browser: desktop/mobile, light/dark |
| `/correspondence/[threadId]` | Build; no browser review |
| `/correspondence/[threadId]/review` | Build; no browser review |
| `/correspondence` | Browser: desktop/mobile, light/dark |
| `/dashboard` | Browser: desktop/mobile, light/dark |
| `/donations` | Browser: required security checkpoint; no bypass or send |
| `/help` | Browser: desktop/mobile, light/dark |
| `/notifications` | Build; no browser review |
| `/overview/due-dates` | Build; no browser review |
| `/overview` | Browser: desktop/mobile, light/dark |
| `/projects/[slug]/budget` | Browser: desktop/mobile, light/dark |
| `/projects/[slug]/chat` | Browser: desktop/mobile, light/dark |
| `/projects/[slug]/episodes` | Code inspection + build; no matching live fixture |
| `/projects/[slug]/members` | Browser: desktop/mobile, light/dark |
| `/projects/[slug]` | Browser: desktop/mobile, light/dark |
| `/projects/[slug]/print` | Browser: desktop/mobile, light/dark |
| `/projects/[slug]/rights` | Browser: desktop/mobile, light/dark |
| `/projects/[slug]/tasks/generate` | Browser: desktop/mobile, light/dark |
| `/projects/[slug]/tasks` | Browser: desktop/mobile, light/dark |
| `/projects/[slug]/tasks/pipeline` | Browser: desktop/mobile, light/dark |
| `/projects/import/[importId]` | Code inspection + build; no matching live fixture |
| `/projects/import` | Browser: desktop/mobile, light/dark |
| `/projects/new` | Browser: desktop/mobile, light/dark |
| `/projects` | Browser: desktop/mobile, light/dark |
| `/projects/plan/[draftId]` | Browser: temporary local fixture, review preservation and simulated failure |
| `/projects/plan` | Browser: desktop/mobile, light/dark |
| `/schedule` | Browser: desktop/mobile, light/dark |
| `/security-check` | Browser: required security checkpoint; no bypass or send |
| `/settings/ai` | Browser: desktop/mobile, light/dark |
| `/settings/costs` | Browser: desktop/mobile, light/dark |
| `/settings/dictionary` | Build; no browser review |
| `/settings/email` | Browser: desktop/mobile, light/dark |
| `/settings/notifications` | Browser: desktop/mobile, light/dark |
| `/settings` | Build; no browser review |
| `/settings/partners` | Build; no browser review |
| `/settings/printers` | Build; no browser review |
| `/settings/profile` | Browser: desktop/mobile, light/dark |
| `/settings/publishers` | Build; no browser review |
| `/settings/roles` | Build; no browser review |
| `/settings/security` | Build; no browser review |
| `/settings/standups/[id]` | Code inspection + build; no matching live fixture |
| `/settings/standups` | Browser: desktop/mobile, light/dark |
| `/settings/team` | Browser: desktop/mobile, light/dark |
| `/settings/templates` | Build; no browser review |
| `/settings/workspace` | Browser: desktop/mobile, light/dark |
| `/standups` | Browser: desktop/mobile, light/dark |
| `/tasks` | Browser: desktop/mobile, light/dark |
| `/wiki/[subjectSlug]/[pageSlug]/edit` | Build; no browser review |
| `/wiki/[subjectSlug]/[pageSlug]` | Build; no browser review |
| `/wiki` | Browser: desktop/mobile, light/dark |
| `/wiki/trash` | Build; no browser review |
| `/workload` | Browser: desktop/mobile, light/dark |
| `/forgot-password` | Build; no browser review |
| `/invite/[token]` | Build; no browser review |
| `/login` | Browser: mobile sign-in; no real email requested |
| `/reset-password` | Build; no browser review |
| `/setup` | Code inspection + build; no matching live fixture |
| `/offline` | Build; no browser review |
| `/` | Build; no browser review |
| `/unsubscribe` | Build; no browser review |

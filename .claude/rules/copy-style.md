# Copy style (plain language for a mixed-literacy, ESL team)

Sastra's users are a translation-ministry team in Cambodia; many read English as
a second language and have a range of software experience. **Any user-facing
string** — label, button, placeholder, `HelpTip`, empty state, toast, error —
must follow `docs/copy-style-guide.md` and use the canonical term from
`docs/terminology.md`.

## When this rule applies

Editing any string a user sees, under `app/(app)/**`, `components/**`, or server
actions that return user-facing messages.

## The short version

- Short sentences (~15 words). Common words. No idioms, no acronyms without a
  one-sentence `HelpTip` explanation.
- **One term per concept** — check `docs/terminology.md` and never introduce a
  synonym for a concept already listed.
- Errors say **what to do next**, never raw codes: "Couldn't save. Check your
  internet and try again."
- Buttons are verb + object ("Add quote"), not "OK"/"Submit"/"Next" on a final
  step.

## Guidance content

On-screen coaching (`CoachCard`, `GuidancePanel`, guided steps) should source its
words from `content/help/*.md` when possible, so help and in-context guidance
stay in sync. When you change a help doc that a `GuidancePanel` reads, re-check
the screen that renders it. Keep help docs current per `.claude/rules/help-docs.md`.

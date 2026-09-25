# Copy style guide (plain language for a mixed-literacy, ESL team)

Sastra is used by a translation-ministry team in Cambodia. Many teammates read
English as a second language and have a range of software experience. Write
every user-facing string so the least-confident reader can act on it.

This guide governs all user-facing text: labels, buttons, placeholders,
tooltips (`HelpTip`), empty states, toasts, and error messages. It does **not**
change domain accuracy — see [terminology.md](./terminology.md) for the one
canonical word per concept.

## The rules

1. **Short sentences.** Aim for ~15 words, 25 maximum. One idea per sentence.
2. **Common words.** Prefer the everyday word: *save* not *persist*, *send* not
   *dispatch*, *change* not *modify*, *get* not *retrieve*, *more* not
   *additional*.
3. **No idioms or figures of speech.** They don't translate. Avoid "ballpark",
   "rule of thumb", "hit send", "up and running", "keep an eye on", "on the fly".
4. **No abbreviations or acronyms** unless the team uses them daily. Spell it
   out, or explain it once in a `HelpTip`. (MOU, RFQ, PDF, and similar get a
   one-sentence plain explanation the first time they appear on a screen.)
5. **One term per concept, everywhere.** Never alternate synonyms for the same
   thing. See the glossary. If you need a word that isn't there, add it there.
6. **Say what to do, not what broke.** Errors name the next action:
   > Couldn't save. Check your internet connection and try again.

   not "Mutation failed (500)". Never show raw codes or stack text to users.
7. **Buttons are verb + object.** "Add quote", "Send for approval", "Create
   project" — not "OK", "Submit", or "Next" on a final step.
8. **Benefit before mechanism.** Say what the user gets, then how. "See who is
   free this week" beats "Aggregate capacity view".
9. **Active voice, present tense, address the reader as "you".**
10. **Numbers and money stay concrete.** Show currency and units; don't make the
    reader infer them.

## Before you ship a string

- Read it aloud. If you stumble, shorten it.
- Would a new teammate know what to do next? If not, add a `HelpTip` or rewrite.
- Is every term the glossary term? Grep for banned synonyms.
- Does the matching `content/help/*.md` doc still describe reality? Update it in
  the same change (see `.claude/rules/help-docs.md`).

## Guidance surfaces

On-screen coaching (coach cards, guided steps) should pull its words from
`content/help/*.md` where possible, via `GuidancePanel`, so help and in-context
guidance never drift apart. When you edit a help doc that a `GuidancePanel`
reads, re-check the screen that renders it.

## Localization (future, out of scope now)

There is no UI localization today; the app is English-only. The current strategy
is plain English + a consistent, small vocabulary + visual support (icons,
guided steps). When Khmer localization is taken on, [terminology.md](./terminology.md)
is the source of truth for translating each concept once. Keep that glossary
current so a future translation pass has a clean starting point.

---
title: "Document learning"
category: "AI & assistant"
roles: [manager, admin]
keywords: [document learning, teach intake, teaching example, reviewed example, extraction correction, document type, opt out, pause learning, shared lesson, Sastra Cloud, agreement, invoice, rights receipt, print quote]
order: 125
summary: "Use approved document corrections to improve later intake of the same kind."
---

**Settings ▸ Document learning** shows examples created from approved document
reviews. New workspaces use document learning by default. Managers can disable
or remove one example; admins can pause learning across the workspace. A paused
workspace keeps its examples and uses none of them while paused. Old reviews
are not enrolled automatically.

An example is captured only after you commit a document import, approve a signed
rights agreement or license fee receipt, accept a print quote, or choose **Save
teaching example only** on an import review. The per-review **Use this document
to improve future intake** checkbox is on by default. Clear it before approving
when this document should not become an example. Autosaved edits, dismissed
suggestions, and rejected quotes do not teach intake. Reopening or rejecting an
accepted print quote deactivates its example.

To teach without changing a project, upload a document from **Projects ▸ Import
from document**, correct its fields, and choose **Save teaching example only**.
This saves the example and file for review without creating a project, changing
rights, recording a payment, or accepting a quote. You can still commit the
import later if appropriate.

The next extraction may use up to a few active examples from the **same document
workflow** with similar text or structure. It learns how fields map to source
terms; it must not copy names, dates, amounts, payment states, or rights grants
from another document. All extracted values still need review. Learning cannot
repair an AI provider outage.

On Sastra Cloud, an admin may open one local example and preview a generalized
cue, field, and interpretation rule. **Submit this payload** sends only the
shown JSON to Cloud for operator review. The original file, document passages,
people, organizations, titles, dates, amounts, and workspace identity are
excluded from that payload. Rejection or retirement of a shared rule does not
change the local example. Hosted instances receive the approved shared library
automatically; self-hosted instances use local examples only.

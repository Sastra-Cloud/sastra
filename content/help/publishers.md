---
title: "Publishers directory"
category: "Publishing"
roles: [manager, admin]
keywords: [publishers, rights holder, licensor, contacts, publisher contact, shorthand, acronym, duplicate publisher, merge publisher, delete publisher, edit publisher, union publishing]
order: 66
summary: "Maintain publisher and rights-holder records, contacts, duplicate matching, safe merges, and deletion rules."
---

**Publishers** (Settings → Publishers) is the shared directory of licensors,
copyright owners, and other rights holders used by project Rights and captured
correspondence. Managers can edit a publisher's name, website, and notes, and
add, edit, or remove its contacts.

## Duplicate prevention

AI document import receives the existing publisher directory and reuses the
stored name when the document uses a recognizable acronym or shorthand. A
second deterministic check runs when the reviewed import is committed. For
example, **Union Publishing** and **Union Publishing (UP)** are treated as the
same organization. An acronym that could refer to more than one publisher is
left for review instead of being guessed.

The same matching runs when a publisher is added manually or by the assistant.
If a matching publisher already exists, Sastra uses that record instead of
creating another one.

## Merge duplicates safely

If duplicates already exist, choose **Merge** on the record you do not want to
keep, then select the canonical publisher. Merge moves project MoU, license,
and copyright-holder links; publisher contacts; and correspondence links. When
both records contain the same contact, links move to the retained contact
instead of creating another duplicate. The source publisher is deleted only
after those links have moved.

## Delete versus merge

**Delete** is available only for an unused publisher. A publisher linked to a
project or correspondence thread cannot be deleted because that would silently
remove operational context. Deleting an unused publisher also deletes its
unlinked contacts. Merge a linked duplicate into the correct publisher instead.
Contacts follow the same safety rule: reassign any project or correspondence
links before removing a linked contact.

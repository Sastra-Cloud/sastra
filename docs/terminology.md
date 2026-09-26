# Terminology glossary (one word per concept)

Authoritative list of the canonical term for each concept in Sastra. Use exactly
these words in UI copy. Do **not** introduce a synonym for a concept already
listed. Pairs with [copy-style-guide.md](./copy-style-guide.md).

If a concept is missing, add it here first, then use it — don't decide ad hoc in
a component.

## Core objects

| Concept | Use this | Don't use | Note |
| --- | --- | --- | --- |
| A book/podcast/video effort being planned | **project** | job, initiative | |
| A unit of work someone does | **task** | work item, to-do, ticket | |
| A group of related tasks in a workflow | **stage** | phase, step | "phase" appears in AI-plan data; UI copy says **stage** |
| A reusable workflow blueprint | **template** | preset, workflow (as a noun for the blueprint) | |
| A person in the workspace | **teammate** / **team member** | user | "user" is fine in code, never in UI copy |
| Workspace permission level | **workspace role** (member / manager / admin) | access level, tier | |
| Job label on a project (translator, editor…) | **project role** | job role, function | distinct from workspace role |

## People and organizations

| Concept | Use this | Don't use | Note |
| --- | --- | --- | --- |
| Rights holder / source publisher | **publisher** | rights holder (in UI), licensor | |
| Funding sponsor (MoU) | **partner** | sponsor, donor, funder | |
| Company that prints books | **printer** | print shop, vendor | |

## Money and budget

| Concept | Use this | Don't use | Note |
| --- | --- | --- | --- |
| The project's internal cost estimate the org prepares | **quotation** | quote (for this), estimate | established, distinct from a printer quote — keep the two words apart |
| A price a printer sends us | **printer quote** | bid, RFQ response | qualify with "printer" so it never reads as the budget quotation |
| Included AI usage on Sastra Cloud | **credits** (AI credits) | tokens, allowance, AI budget, dollars | hosted workspaces never see a dollar figure for AI; self-hosted installations see real provider dollars |
| How much file storage a Sastra Cloud plan allows | **file space** | storage, disk, quota, capacity | shown in GB; self-hosted installations have no limit |
| The document sent to a partner for funding | **proposal** | pitch, offer | |
| Checking real amounts against the plan | **reconciliation** | true-up, settle | domain term; explain once in a `HelpTip` |
| Money received from a partner | **funding received** | receipt, inflow | |
| Author/rights payment tied to sales | **royalty** | cut, share | |
| Signed funding agreement with a partner | **MoU** | agreement (when it's specifically the MoU) | spell out once: "MoU (a funding agreement)" |
| Fee the organization keeps from a donation | **organization donation fee** | admin fee, overhead | matches Settings copy |

## Print

| Concept | Use this | Don't use | Note |
| --- | --- | --- | --- |
| One order to print a quantity of a title | **print run** | printing, press run, batch | |
| Printing more of a title later | **reprint** | re-run, second printing | |
| Asking printers for prices | **request quotes** | send RFQ, solicit bids | RFQ only in `HelpTip` explanation |
| Cost for each copy | **cost per copy** | unit cost, per-unit price | |

## Actions and states

| Concept | Use this | Don't use | Note |
| --- | --- | --- | --- |
| Make a new record | **Add** (inline) / **Create** (top-level) | New, Insert | "Add quote", "Create project" |
| Remove permanently | **Delete** | Remove, Destroy, Trash | confirm first |
| Save without publishing | **Save** | Persist, Store | |
| Make visible/active to others | **Publish** / **Send** | Push, Release | |
| Not started / in progress / done | **To do** / **In progress** / **Done** | Open / WIP / Complete | match the task board |

## Guidance features (this initiative)

| Concept | Use this | Note |
| --- | --- | --- |
| The per-user coaching switch | **guidance** ("Show helpful guidance") | Profile setting |
| A step-by-step helper for a big task | **guided setup** / **guided steps** | wizards; always skippable |
| A dismissible on-screen tip block | **tip** (coach card) | |

## Destinations

- **Home** (`/dashboard`): next onboarding action, personal queue, manager reviews, recent projects.
- **My Work** (`/tasks`): complete personal task workspace.
- **Team planning**: Overview, Schedule, and Workload, preserving their existing URLs.
- **Project roles**, **Voice dictionary**, **AI usage**: use these full Settings labels.
- **Source page count**, **Add standard budget items**, and **Request printer quotes**: publishing labels.

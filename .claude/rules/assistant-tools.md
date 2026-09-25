---
paths:
  - "lib/assistant/**"
  - "components/assistant/**"
  - "lib/tasks/actions.ts"
  - "lib/tasks/create.ts"
description: "Assistant tool contracts, approval flow, and task id propagation"
---

# Assistant Tools

The in-app assistant persists model tool calls, asks for approval before write tools, then resumes the loop after approved tools execute.

## Write tool contract

- Write tools must return enough structured data for the next turn to act without rediscovering rows.
- Newly created records should return ids. For task creation, `create_task` must return `taskId`.
- Do not rely on the model to infer ids from visible UI text or list queries after a successful create.
- If a task assignee is omitted, default to the current user. Use an explicit unassigned flag only when the user asks for no assignee.
- Never turn missing ids into strings such as `"undefined"` or `"null"`.

## Approval flow

- Reads and memory tools auto-run.
- Writes create pending actions and execute only after approval.
- A write tool result is inserted as a tool message; the agent loop resumes only after every pending action for that assistant turn is resolved.
- User-visible assistant text should not claim a write happened until the approved tool result confirms it.

## Validation

Run focused checks after changes:

```bash
pnpm exec eslint lib/assistant lib/tasks/actions.ts lib/tasks/create.ts
pnpm typecheck
```

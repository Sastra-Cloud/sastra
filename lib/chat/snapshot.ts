/**
 * Recent-chat responses are JSON snapshots. Keep the current state when a poll
 * hasn't changed anything, so it doesn't rebuild the transcript and pin menus.
 * Compare the full payload (including edits, reactions, files and reply previews),
 * after optimistic reconciliation. IDs alone aren't a freshness check.
 * No snapshots are cached beyond the component's existing state.
 */
export function reuseChatSnapshot<T>(current: T, incoming: T): T {
  return JSON.stringify(current) === JSON.stringify(incoming) ? current : incoming;
}

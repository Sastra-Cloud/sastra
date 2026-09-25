/** Stable identity for the only one-to-one conversation shared by two users. */
export function directConversationKey(firstUserId: string, secondUserId: string) {
  return [firstUserId, secondUserId]
    .sort((a, b) => a.localeCompare(b))
    .map((id) => `${id.length}:${id}`)
    .join("|");
}

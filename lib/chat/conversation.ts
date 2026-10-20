/** Viewport math shared by route conversations and full-screen sheets. */
export function conversationViewport(
  viewport: { height: number; offsetTop: number },
  top: number,
  floating: boolean,
  bottomGap = 0
) {
  return {
    top: viewport.offsetTop,
    height: Math.max(0, floating ? viewport.height : viewport.offsetTop + viewport.height - top - bottomGap),
  };
}

export function isNearConversationEnd(element: {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= 96;
}

/** IME confirmation and touch Return must never submit a message. */
export function shouldSendConversationKey(
  event: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; isComposing: boolean; keyCode?: number },
  touchFirst: boolean
) {
  return event.key === "Enter" && !event.isComposing && event.keyCode !== 229 &&
    !event.shiftKey && (!touchFirst || event.ctrlKey || event.metaKey);
}

type GroupableMessage = { userId: string | null; createdAt: string };
const dayFormatters = new Map<string | undefined, Intl.DateTimeFormat>();

export function conversationDay(iso: string, timeZone?: string) {
  let formatter = dayFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    dayFormatters.set(timeZone, formatter);
  }
  return formatter.format(new Date(iso));
}

export function continuesMessageGroup(
  previous: GroupableMessage | undefined,
  current: GroupableMessage,
  timeZone?: string
) {
  if (!previous || !current.userId || previous.userId !== current.userId) return false;
  const elapsed = new Date(current.createdAt).getTime() - new Date(previous.createdAt).getTime();
  return elapsed >= 0 && elapsed <= 5 * 60_000 &&
    conversationDay(previous.createdAt, timeZone) === conversationDay(current.createdAt, timeZone);
}

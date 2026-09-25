/**
 * "Only during work hours" notifications are the complement of "quiet hours":
 * push is allowed during [workStart, workEnd) and silenced the rest of the day.
 * The push gate only understands quiet hours, so we store the complement window.
 * All values are minutes-of-day (0–1439) in the user's timezone.
 */
export function workToQuietWindow(
  workStart: number,
  workEnd: number
): { quietStart: number; quietEnd: number } {
  // Quiet = outside work → begins when work ends, ends when work begins.
  return { quietStart: workEnd, quietEnd: workStart };
}

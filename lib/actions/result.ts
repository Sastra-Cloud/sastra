export type MutationError = {
  message: string;
  code?: string;
  fieldErrors?: Record<string, string[]>;
};

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: MutationError };

type LegacyActionResult = {
  error?: string | MutationError;
};

/**
 * Server actions in the app still use a few historic result shapes. Keep the
 * client boundary tolerant while actions are migrated to ActionResult.
 */
export function mutationErrorMessage(
  result: unknown,
  fallback = "That change could not be saved."
): string | null {
  if (!result || typeof result !== "object" || !("error" in result)) return null;
  const error = (result as LegacyActionResult).error;
  if (!error) return null;
  return typeof error === "string" ? error : error.message || fallback;
}

export function thrownMutationMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

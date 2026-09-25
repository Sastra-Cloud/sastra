export type GuidanceMutation = {
  guidanceKey: string;
  dismissed: boolean;
};

export function updateGuidanceDismissals(
  current: ReadonlySet<string>,
  mutation: GuidanceMutation
): ReadonlySet<string> {
  const next = new Set(current);
  if (mutation.dismissed) next.add(mutation.guidanceKey);
  else next.delete(mutation.guidanceKey);
  return next;
}

export function guidanceMutationKey(mutation: GuidanceMutation) {
  return mutation.guidanceKey;
}

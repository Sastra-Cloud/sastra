export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export function getNewPasswordError(
  password: string,
  confirmation: string
): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Use no more than ${PASSWORD_MAX_LENGTH} characters.`;
  }
  if (password !== confirmation) {
    return "The passwords do not match.";
  }
  return null;
}

export function isInvalidPasswordResetLink({
  token,
  error,
}: {
  token?: string;
  error?: string;
}) {
  return Boolean(error) || !token;
}

import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { isInvalidPasswordResetLink } from "@/lib/auth/password-reset";

export const metadata = { title: "Choose a new password" };

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{
    token?: string | string[];
    error?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const token = firstValue(params.token);
  const error = firstValue(params.error);
  const invalid = isInvalidPasswordResetLink({ token, error });

  return (
    <AuthCardShell
      title={invalid ? "Request a new link" : "Choose a new password"}
      description={
        invalid
          ? "Password reset links expire after one hour."
          : "Your new password will replace the password you used before."
      }
    >
      <ResetPasswordForm token={token} invalid={invalid} />
    </AuthCardShell>
  );
}

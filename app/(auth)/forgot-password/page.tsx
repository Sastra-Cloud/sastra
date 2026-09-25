import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCardShell
      title="Reset your password"
      description="Enter your email. We will send a link to choose a new password."
    >
      <ForgotPasswordForm />
    </AuthCardShell>
  );
}

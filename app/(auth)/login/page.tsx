import { Suspense } from "react";

import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { LoginForm } from "@/components/auth/login-form";
import { BootstrapAdminForm } from "@/components/auth/bootstrap-admin-form";
import { isInitialAdminBootstrapEnabled } from "@/lib/auth/provisioning";
import { countHumanUsers } from "./actions";

export const metadata = { title: "Sign in" };

// Queries the DB (bootstrap check) on each request — never statically prerender.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const needsBootstrap =
    isInitialAdminBootstrapEnabled() && (await countHumanUsers()) === 0;

  return (
    <AuthCardShell
      title={needsBootstrap ? "Create the first admin" : "Sign in"}
      description={
        needsBootstrap
          ? "No accounts exist yet. Set up the workspace admin to get started."
          : "Welcome back. Sign in to continue."
      }
    >
      {needsBootstrap ? (
        <BootstrapAdminForm />
      ) : (
        <Suspense>
          <LoginForm />
        </Suspense>
      )}
    </AuthCardShell>
  );
}

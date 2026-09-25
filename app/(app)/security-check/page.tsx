import { ShieldCheck } from "lucide-react";

import { AdminSecurityCheck } from "@/components/auth/admin-security-check";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContentColumn } from "@/components/cockpit";
import { requireRole } from "@/lib/auth/guards";
import { auth } from "@/lib/auth/auth";
import { headers } from "next/headers";

export const metadata = { title: "Security check" };
export const dynamic = "force-dynamic";

function safeNext(value: string | string[] | undefined) {
  const next = typeof value === "string" ? value : "/dashboard";
  return next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/dashboard";
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "your account email";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, Math.min(6, local.length - visible.length)))}@${domain}`;
}

export default async function SecurityCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { user } = await requireRole("admin");
  const passkeys = await auth.api.listPasskeys({ headers: await headers() });
  const next = safeNext((await searchParams).next);

  return (
    <ContentColumn className="flex min-h-[70dvh] items-center">
      <Card className="w-full">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="size-6" />
          </div>
          <CardTitle>Quick security check</CardTitle>
          <p className="text-sm text-muted-foreground">
            Donation records contain private financial information. Confirm it’s
            you before continuing.
          </p>
        </CardHeader>
        <CardContent>
          <AdminSecurityCheck
            email={maskEmail(user.email)}
            hasPasskey={passkeys.length > 0}
            next={next}
          />
        </CardContent>
      </Card>
    </ContentColumn>
  );
}

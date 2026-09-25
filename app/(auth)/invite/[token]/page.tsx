import Link from "next/link";

import { getInvitationByToken } from "@/lib/team/queries";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Brand } from "@/components/brand";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";

export const metadata = { title: "Accept invite" };
export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await getInvitationByToken(token);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="mb-6 text-center">
        <Brand className="text-2xl" iconClassName="size-9" />
      </div>
      <Card className="w-full max-w-sm">
        {invite ? (
          <>
            <CardHeader>
              <CardTitle>You&apos;re invited</CardTitle>
              <CardDescription>
                Set up your account to join the team as{" "}
                <span className="font-medium">
                  {invite.role === "super_admin"
                    ? "super admin"
                    : invite.role}
                </span>
                .
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AcceptInviteForm token={token} email={invite.email} />
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Invite not valid</CardTitle>
              <CardDescription>
                This invitation is invalid or has expired. Ask an admin for a new
                one.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/login" className="text-sm underline">
                Back to sign in
              </Link>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function SignOutButton({
  menuItem = false,
  className,
}: {
  menuItem?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSignOut() {
    if (pending) return;
    setPending(true);
    try {
      const result = await authClient.signOut();
      if (result.error) throw result.error;
      router.push("/login");
      router.refresh();
    } catch {
      setPending(false);
      toast.error("Couldn't sign out. Try again.");
    }
  }

  if (menuItem) {
    return (
      <DropdownMenuItem
        disabled={pending}
        onClick={onSignOut}
        className={cn("gap-2 px-2 py-2", className)}
      >
        <LogOut />
        {pending ? "Signing out…" : "Sign out"}
      </DropdownMenuItem>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={onSignOut}
      className={className}
    >
      <LogOut className="size-4" />
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}

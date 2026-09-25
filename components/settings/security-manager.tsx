"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useState, useTransition } from "react";
import { Fingerprint, Loader2, MonitorSmartphone, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { revokeAllTrustedBrowsers } from "@/lib/auth/assurance-actions";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PasskeyRow = {
  id: string;
  name?: string | null;
  deviceType: string;
  backedUp: boolean;
  createdAt?: Date | null;
};

type TrustedBrowser = {
  id: string;
  verifiedBy: "email_code" | "passkey";
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
};

export function SecurityManager({
  passkeys,
  trustedBrowsers,
}: {
  passkeys: PasskeyRow[];
  trustedBrowsers: TrustedBrowser[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [passkeyPending, setPasskeyPending] = useState<string | null>(null);
  const [revoking, startRevoke] = useTransition();

  async function addPasskey() {
    setPasskeyPending("add");
    const result = await authClient.passkey.addPasskey({
      name: name.trim() || "My passkey",
    });
    setPasskeyPending(null);
    if (result?.error) {
      toast.error(result.error.message || "Could not add the passkey.");
      return;
    }
    setName("");
    toast.success("Passkey added");
    router.refresh();
  }

  async function removePasskey(id: string) {
    if (!(await confirmDialog("Remove this passkey from your account?"))) return;
    setPasskeyPending(id);
    const { error } = await authClient.passkey.deletePasskey({ id });
    setPasskeyPending(null);
    if (error) {
      toast.error(error.message || "Could not remove the passkey.");
      return;
    }
    toast.success("Passkey removed");
    router.refresh();
  }

  async function revokeBrowsers() {
    if (
      !(await confirmDialog("Sign this browser and every other trusted browser out of protected admin access?"))
    ) {
      return;
    }
    startRevoke(async () => {
      await revokeAllTrustedBrowsers();
      toast.success("Trusted browsers revoked");
      router.push("/security-check?next=%2Fsettings%2Fsecurity");
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="font-semibold">Passkeys</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Use a fingerprint, face scan, device PIN, or security key. Sastra
            stores only the public credential—not your biometric data.
          </p>
        </div>
        <div className="grid max-w-lg gap-3 rounded-xl border p-4">
          <div className="grid gap-2">
            <Label htmlFor="passkey-name">Passkey name</Label>
            <Input
              id="passkey-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Office laptop"
              maxLength={80}
            />
          </div>
          <Button
            type="button"
            onClick={addPasskey}
            disabled={passkeyPending !== null}
            className="justify-self-start"
          >
            {passkeyPending === "add" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Fingerprint className="size-4" />
            )}
            {passkeyPending === "add" ? "Waiting for device…" : "Add passkey"}
          </Button>
        </div>
        <div className="grid gap-2">
          {passkeys.length ? (
            passkeys.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {item.name || "Passkey"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.backedUp ? "Synced passkey" : "Device passkey"}
                    {item.createdAt
                      ? ` · Added ${new Date(item.createdAt).toLocaleDateString()}`
                      : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${item.name || "passkey"}`}
                  disabled={passkeyPending !== null}
                  onClick={() => removePasskey(item.id)}
                >
                  {passkeyPending === item.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </Button>
              </div>
            ))
          ) : (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              No passkeys yet. Email codes will remain available as a fallback.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-4 border-t pt-6">
        <div>
          <h2 className="font-semibold">Trusted browsers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A security check lasts 60 days on a browser. Revoke all if a device
            is lost or shared unexpectedly.
          </p>
        </div>
        <div className="grid gap-2">
          {trustedBrowsers.map((browser) => (
            <div
              key={browser.id}
              className="flex items-center gap-3 rounded-xl border px-4 py-3"
            >
              <MonitorSmartphone className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 text-sm">
                <p className="font-medium">
                  Verified by{" "}
                  {browser.verifiedBy === "passkey" ? "passkey" : "email code"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Last used {new Date(browser.lastUsedAt).toLocaleDateString()} ·
                  expires {new Date(browser.expiresAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={revoking || trustedBrowsers.length === 0}
          onClick={revokeBrowsers}
        >
          {revoking ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
          Revoke all trusted browsers
        </Button>
      </section>
    </div>
  );
}

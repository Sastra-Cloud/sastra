"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";

import { sendTestPush } from "@/lib/notifications/actions";
import { Button } from "@/components/ui/button";

/**
 * Sends a real push to the current user's devices so they can confirm delivery
 * works. Progress-based: shows a pending label and reports the true outcome
 * (delivery can't be assumed locally).
 */
export function TestPushButton() {
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const result = await sendTestPush();
      if (result.ok) {
        const n = result.data?.sent ?? 0;
        toast.success(
          `Test sent to ${n} device${n === 1 ? "" : "s"} — it should arrive shortly.`
        );
      } else {
        toast.error(result.error.message);
      }
    } catch {
      toast.error("Could not send the test notification.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={run} disabled={busy}>
      <Send />
      {busy ? "Sending…" : "Send test notification"}
    </Button>
  );
}

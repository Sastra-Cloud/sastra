"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** Copy the correspondence address, so people can paste it into CC or a forward. */
export function CopyAddressButton({ address }: { address: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast.success("Address copied.");
    } catch {
      toast.error("Couldn't copy. Select the address and copy it.");
    }
  };
  return (
    <Button type="button" variant="outline" size="sm" onClick={copy} aria-label={`Copy ${address}`}>
      <Copy className="size-3.5" aria-hidden /> Copy
    </Button>
  );
}

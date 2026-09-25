"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completeWorkspaceSetup } from "@/lib/workspace/actions";

const COMMON_ZONES = [
  "UTC",
  "Asia/Phnom_Penh",
  "Asia/Bangkok",
  "Asia/Ho_Chi_Minh",
  "Asia/Yangon",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
];

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function WorkspaceSetupForm({
  adminEmail,
}: {
  adminEmail: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [orgName, setOrgName] = useState("");

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(async () => {
          const res = await completeWorkspaceSetup({
            orgName,
            legalName: String(data.get("legalName") ?? ""),
            orgAliases: String(data.get("orgAliases") ?? "")
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            internalEmailDomains: String(data.get("internalEmailDomains") ?? "")
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            timezone: String(data.get("timezone") ?? "UTC"),
            sourceLanguage: String(data.get("sourceLanguage") ?? ""),
            targetLanguage: String(data.get("targetLanguage") ?? ""),
            defaultTerritory: String(data.get("defaultTerritory") ?? ""),
            defaultCurrency: String(data.get("defaultCurrency") ?? "USD").toUpperCase(),
            contactEmail: adminEmail,
            missionContext: String(data.get("missionContext") ?? ""),
          });
          if (res.error) {
            toast.error(res.error);
            return;
          }
          toast.success(`${orgName} is ready in Sastra`);
          router.replace("/dashboard");
          router.refresh();
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="orgName">Organization name</Label>
          <Input
            id="orgName"
            value={orgName}
            onChange={(event) => setOrgName(event.target.value)}
            placeholder="Your translation ministry"
            required
            autoFocus
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="legalName">Legal name</Label>
          <Input id="legalName" name="legalName" placeholder="If different from the display name" />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="orgAliases">Other names and programs</Label>
          <Input id="orgAliases" name="orgAliases" placeholder="Comma-separated abbreviations or program names" />
          <p className="text-xs text-muted-foreground">
            Sastra uses these to avoid mistaking your own organization for an external partner.
          </p>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="internalEmailDomains">Internal email domains</Label>
          <Input id="internalEmailDomains" name="internalEmailDomains" placeholder="example.org, another-domain.org" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sourceLanguage">Primary source language</Label>
          <Input id="sourceLanguage" name="sourceLanguage" placeholder="English" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="targetLanguage">Primary target language</Label>
          <Input id="targetLanguage" name="targetLanguage" placeholder="Your target language" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="timezone">Workspace timezone</Label>
          <select id="timezone" name="timezone" className={selectClass} defaultValue="UTC">
            {COMMON_ZONES.map((zone) => <option key={zone}>{zone}</option>)}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="defaultCurrency">Default currency</Label>
          <Input id="defaultCurrency" name="defaultCurrency" defaultValue="USD" maxLength={8} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="defaultTerritory">Default territory</Label>
          <Input id="defaultTerritory" name="defaultTerritory" placeholder="Country or region" />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="missionContext">Ministry context for AI</Label>
          <textarea
            id="missionContext"
            name="missionContext"
            rows={3}
            className="min-h-20 rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            placeholder="Briefly describe your organization, publishing focus, and audience."
          />
        </div>
      </div>
      <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto sm:justify-self-end">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
        {pending ? "Preparing workspace…" : "Enter Sastra"}
      </Button>
    </form>
  );
}

"use client";

import { FieldError, FieldErrorsContext } from "./field-errors";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimezoneControl } from "./timezone-control";
import { Label } from "@/components/ui/label";
import { completeWorkspaceSetup } from "@/lib/workspace/actions";

export function WorkspaceSetupForm({
  adminEmail,
}: {
  adminEmail: string;
}) {
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [orgName, setOrgName] = useState("");

  return (
    <FieldErrorsContext.Provider value={fieldErrors}>
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(async () => {
          try {
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
          setFieldErrors(res.fieldErrors ?? {});
          if (res.error) {
            toast.error(res.error);
            return;
          }
          toast.success(`${orgName} is ready in Sastra`);
          router.replace("/dashboard");
          router.refresh();
          } catch { toast.error("Could not prepare the workspace. Your answers are still here; try again."); }
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
            placeholder="Your publishing team"
            required
            autoFocus
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sourceLanguage">Primary source language</Label>
          <Input aria-describedby="sourceLanguage-error" id="sourceLanguage" name="sourceLanguage" placeholder="Source language" required /><FieldError name="sourceLanguage" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="targetLanguage">Primary target language</Label>
          <Input aria-describedby="targetLanguage-error" id="targetLanguage" name="targetLanguage" placeholder="Your target language" required /><FieldError name="targetLanguage" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="timezone">Workspace timezone</Label>
          <TimezoneControl id="timezone" defaultValue={"UTC"} /><FieldError name="timezone" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="defaultCurrency">Default currency</Label>
          <Input aria-describedby="defaultCurrency-error" id="defaultCurrency" name="defaultCurrency" defaultValue="USD" maxLength={8} required /><FieldError name="defaultCurrency" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="defaultTerritory">Default territory</Label>
          <Input aria-describedby="defaultTerritory-error" id="defaultTerritory" name="defaultTerritory" placeholder="Country or region" /><FieldError name="defaultTerritory" />
        </div>

      </div>
      <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Optional organization details and AI context</summary><div className="mt-4 grid gap-4">        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="legalName">Legal name</Label>
          <Input aria-describedby="legalName-error" id="legalName" name="legalName" placeholder="If different from the display name" /><FieldError name="legalName" />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="orgAliases">Other names and programs</Label>
          <Input aria-describedby="orgAliases-error" id="orgAliases" name="orgAliases" placeholder="Comma-separated abbreviations or program names" /><FieldError name="orgAliases" />
          <p className="text-xs text-muted-foreground">
            Sastra uses these to avoid mistaking your own organization for an external partner.
          </p>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="internalEmailDomains">Internal email domains</Label>
          <Input aria-describedby="internalEmailDomains-error" id="internalEmailDomains" name="internalEmailDomains" placeholder="example.org, another-domain.org" /><FieldError name="internalEmailDomains" />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="missionContext">Publishing context for AI</Label>
          <textarea
            id="missionContext"
            name="missionContext"
            rows={3}
            className="min-h-20 rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            placeholder="Briefly describe your organization, publishing focus, and audience."
          />
        </div></div></details>
      <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto sm:justify-self-end">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
        {pending ? "Preparing workspace…" : "Enter Sastra"}
      </Button>
    </form>
    </FieldErrorsContext.Provider>
  );
}

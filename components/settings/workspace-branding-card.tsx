"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadFile } from "@/lib/files/upload-client";
import {
  removeWorkspaceLogo,
  setWorkspaceLogo,
  updateWorkspaceBranding,
} from "@/lib/workspace/actions";
import { usePropState } from "@/hooks/use-prop-state";

export function WorkspaceBrandingCard({
  settings,
}: {
  settings: {
    logoFileId: string | null;
    accentColor: string;
    orgName: string | null;
    orgAliases: string[];
    internalEmailDomains: string[];
    preparedByNote: string | null;
  };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [logoFileId, setLogoFileId] = usePropState(settings.logoFileId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [accentColor, setAccentColor] = useState(settings.accentColor);
  const [orgName, setOrgName] = useState(settings.orgName ?? "");
  const [orgAliases, setOrgAliases] = useState(settings.orgAliases.join(", "));
  const [internalEmailDomains, setInternalEmailDomains] = useState(
    settings.internalEmailDomains.join(", ")
  );
  const [preparedByNote, setPreparedByNote] = useState(
    settings.preparedByNote ?? ""
  );

  const run = (fn: () => Promise<{ error?: string } | void>) =>
    start(async () => {
      try {
        const res = await fn();
        if (res?.error) {
          toast.error(res.error);
          return;
        }
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save.");
      }
    });

  async function onLogoPicked(file: File) {
    setUploading(true);
    try {
      const fileId = await uploadFile(file);
      if (!fileId) return; // uploadFile already toasted
      const res = await setWorkspaceLogo(fileId);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      setLogoFileId(fileId);
      toast.success("Logo updated");
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="size-4" />
          Workspace identity & branding
        </CardTitle>
        <CardDescription>
          Defines your organization for AI context and brands generated quotation
          spreadsheets and MoU proposals. Applies to the whole workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex size-20 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
            {logoFileId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/files/${logoFileId}/download?inline=1`}
                alt="Workspace logo"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <ImageIcon className="size-6 text-muted-foreground" />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onLogoPicked(file);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={uploading || pending}
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="size-4" />
              {logoFileId ? "Replace logo" : "Upload logo"}
            </Button>
            {logoFileId ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={uploading || pending}
                onClick={async () => {
                  if (!(await confirmDialog("Remove the workspace logo?"))) return;
                  const previous = logoFileId;
                  setLogoFileId(null);
                  start(async () => {
                    try {
                      const res = await removeWorkspaceLogo();
                      if (res?.error) throw new Error(res.error);
                      router.refresh();
                    } catch (error) {
                      setLogoFileId(previous);
                      toast.error(error instanceof Error ? error.message : "Could not remove the logo.");
                    }
                  });
                }}
              >
                <Trash2 className="size-4" />
                Remove
              </Button>
            ) : null}
            {uploading ? (
              <span className="self-center text-xs text-muted-foreground">
                Uploading…
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Accent color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent"
                aria-label="Accent color"
              />
              <Input
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                placeholder="#B65C3A"
                className="font-mono"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Primary organization name</Label>
            <Input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="e.g. Your translation ministry"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Organization aliases</Label>
            <Input
              value={orgAliases}
              onChange={(e) => setOrgAliases(e.target.value)}
              placeholder="Program names and abbreviations"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated names the AI should recognize as your own organization.
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Internal email domains</Label>
            <Input
              value={internalEmailDomains}
              onChange={(e) => setInternalEmailDomains(e.target.value)}
              placeholder="yourorganization.org"
            />
            <p className="text-xs text-muted-foreground">
              Active team members and these domains are treated as internal by correspondence AI.
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>&quot;Prepared by&quot; note</Label>
            <Input
              value={preparedByNote}
              onChange={(e) => setPreparedByNote(e.target.value)}
              placeholder="e.g. Prepared by the Sastra team"
            />
          </div>
        </div>

        <div className="flex justify-end pr-14">
          <Button
            disabled={pending || uploading}
            onClick={() =>
              run(async () => {
                const res = await updateWorkspaceBranding({
                  accentColor,
                  orgName,
                  orgAliases: orgAliases
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean),
                  internalEmailDomains: internalEmailDomains
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean),
                  preparedByNote,
                });
                if (!res?.error) toast.success("Workspace settings saved");
                return res;
              })
            }
          >
            Save workspace settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useContext, useRef, useState, useTransition } from "react";
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
} from "@/lib/workspace/actions";
import { usePropState } from "@/hooks/use-prop-state";
import { FieldError, FieldErrorsContext } from "./field-errors";

export function WorkspaceBrandingCard({
  settings,
  saving,
  onBusyChange,
}: {
  settings: {
    logoFileId: string | null;
    accentColor: string;
    orgName: string | null;
    orgAliases: string[];
    internalEmailDomains: string[];
    preparedByNote: string | null;
  };
  saving: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const errors = useContext(FieldErrorsContext);
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

  async function onLogoPicked(file: File) {
    setUploading(true);
    onBusyChange(true);
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
      onBusyChange(false);
    }
  }

  return (
    <Card className="@[80rem]/settings:col-span-2">
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
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading || pending || saving}
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="size-4" />
              {logoFileId ? "Replace logo" : "Upload logo"}
            </Button>
            {logoFileId ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={uploading || pending || saving}
                onClick={async () => {
                  if (!(await confirmDialog("Remove the workspace logo?"))) return;
                  const previous = logoFileId;
                  setLogoFileId(null);
                  onBusyChange(true);
                  start(async () => {
                    try {
                      const res = await removeWorkspaceLogo();
                      if (res?.error) throw new Error(res.error);
                      router.refresh();
                    } catch (error) {
                      setLogoFileId(previous);
                      toast.error(error instanceof Error ? error.message : "Could not remove the logo.");
                    } finally {
                      onBusyChange(false);
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
        <p className="text-xs text-muted-foreground">Logo changes apply immediately. Save the other details with Save workspace settings.</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="workspace-accentColor">Accent color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent"
                aria-label="Accent color"
              />
              <Input
                id="workspace-accentColor"
                name="accentColor"
                aria-invalid={!!errors.accentColor}
                aria-describedby={errors.accentColor ? "accentColor-error" : undefined}
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                placeholder="#B65C3A"
                className="font-mono"
              />
            </div>
            <FieldError name="accentColor" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="orgName">Primary organization name</Label>
            <Input
              id="orgName"
              name="orgName"
              aria-invalid={!!errors.orgName}
              aria-describedby={errors.orgName ? "orgName-error" : undefined}
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="e.g. Your translation ministry"
            />
            <FieldError name="orgName" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="orgAliases">Organization aliases</Label>
            <Input
              id="orgAliases"
              name="orgAliases"
              value={orgAliases}
              onChange={(e) => setOrgAliases(e.target.value)}
              placeholder="Program names and abbreviations"
            />
            <FieldError name="orgAliases" />
            <p className="text-xs text-muted-foreground">
              Comma-separated names the AI should recognize as your own organization.
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="internalEmailDomains">Internal email domains</Label>
            <Input
              id="internalEmailDomains"
              name="internalEmailDomains"
              value={internalEmailDomains}
              onChange={(e) => setInternalEmailDomains(e.target.value)}
              placeholder="yourorganization.org"
            />
            <FieldError name="internalEmailDomains" />
            <p className="text-xs text-muted-foreground">
              Active team members and these domains are treated as internal by correspondence AI.
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="preparedByNote">&quot;Prepared by&quot; note</Label>
            <Input
              id="preparedByNote"
              name="preparedByNote"
              value={preparedByNote}
              onChange={(e) => setPreparedByNote(e.target.value)}
              placeholder="e.g. Prepared by the Sastra team"
            />
            <FieldError name="preparedByNote" />
          </div>
        </div>

      </CardContent>
    </Card>
  );
}

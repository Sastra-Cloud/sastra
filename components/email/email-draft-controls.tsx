"use client";

import { Loader2, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export function EmailDraftControls({
  hasSavedDraft,
  hasUnsavedChanges,
  saving,
  discarding,
  updatedAt,
  onSave,
  onDiscard,
}: {
  hasSavedDraft: boolean;
  hasUnsavedChanges: boolean;
  saving: boolean;
  discarding: boolean;
  updatedAt: string | null;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const status = saving
    ? "Saving draft…"
    : hasUnsavedChanges
      ? hasSavedDraft
        ? "Unsaved changes"
        : "Draft not saved"
      : updatedAt
        ? `Saved ${new Date(updatedAt).toLocaleString([], {
            dateStyle: "medium",
            timeStyle: "short",
          })}`
        : hasSavedDraft
          ? "Draft saved"
          : "No saved draft";

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span aria-live="polite" className="mr-auto">
        {status}
      </span>
      {hasSavedDraft ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={saving || discarding}
          onClick={onDiscard}
        >
          {discarding ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
          Discard draft
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="xs"
        disabled={saving || discarding || !hasUnsavedChanges}
        onClick={onSave}
      >
        {saving ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Save className="size-3.5" />
        )}
        {saving ? "Saving…" : "Save draft"}
      </Button>
    </div>
  );
}

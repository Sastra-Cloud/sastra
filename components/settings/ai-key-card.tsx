"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePropState } from "@/hooks/use-prop-state";
import { mutationErrorMessage, thrownMutationMessage } from "@/lib/actions/result";
import {
  removeOpenRouterApiKey,
  updateOpenRouterApiKey,
} from "@/lib/ai/key-actions";
import type { OpenRouterKeyStatus } from "@/lib/ai/keys";
import { confirmDialog } from "@/lib/dialog-requests";

type StoredKey = { last4: string; updatedAt: string | null };

/**
 * Admin card for the OpenRouter "AI key". Saving is progress-based (a
 * credential write cannot truthfully look done before the server confirms);
 * removal is confirmed, then optimistic with rollback.
 */
export function AiKeyCard({ status }: { status: OpenRouterKeyStatus }) {
  const router = useRouter();
  const inputId = useId();
  // Memoized so the prop-state reset only fires when the server value changes.
  const { storedLast4, storedUpdatedAt } = status;
  const storedSource = useMemo<StoredKey | null>(
    () => (storedLast4 ? { last4: storedLast4, updatedAt: storedUpdatedAt } : null),
    [storedLast4, storedUpdatedAt]
  );
  const [stored, setStored] = usePropState<StoredKey | null>(storedSource);
  const [unreadable, setUnreadable] = usePropState(status.storedKeyUnreadable);
  const [draft, setDraft] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [removing, startRemove] = useTransition();

  const save = () => {
    const apiKey = draft.trim();
    if (!apiKey) {
      setFieldError("Enter the AI key.");
      return;
    }
    if (!apiKey.startsWith("sk-or-")) {
      setFieldError("The AI key must start with sk-or-.");
      return;
    }
    setFieldError(null);
    startSave(async () => {
      try {
        const result = await updateOpenRouterApiKey({ apiKey });
        const expected = mutationErrorMessage(result);
        if (expected || !result.ok) {
          setFieldError(expected ?? "Couldn't save the AI key. Try again.");
          return;
        }
        setStored({
          last4: result.data?.last4 ?? apiKey.slice(-4),
          updatedAt: result.data?.updatedAt ?? new Date().toISOString(),
        });
        setUnreadable(false);
        setDraft("");
        toast.success("AI key saved");
        router.refresh();
      } catch (error) {
        setFieldError(
          thrownMutationMessage(
            error,
            "Couldn't save the AI key. Check your internet and try again."
          )
        );
      }
    });
  };

  const remove = async () => {
    const ok = await confirmDialog(
      status.envConfigured
        ? "Remove the AI key? AI will use the server key instead."
        : "Remove the AI key? AI features will stop until a key is added.",
      { confirmLabel: "Remove key" }
    );
    if (!ok) return;
    const previous = { stored, unreadable };
    setStored(null);
    setUnreadable(false);
    startRemove(async () => {
      try {
        const result = await removeOpenRouterApiKey();
        const expected = mutationErrorMessage(result);
        if (expected) throw new Error(expected);
        toast.success("AI key removed");
        router.refresh();
      } catch (error) {
        setStored(previous.stored);
        setUnreadable(previous.unreadable);
        toast.error(
          thrownMutationMessage(
            error,
            "Couldn't remove the AI key. Check your internet and try again."
          )
        );
      }
    });
  };

  const hasStored = stored !== null;
  const updatedLabel = stored?.updatedAt
    ? new Date(stored.updatedAt).toLocaleDateString()
    : null;

  return (
    <section
      aria-labelledby="ai-key-heading"
      className="overflow-hidden rounded-xl border bg-card"
    >
      <div className="flex min-h-20 items-start gap-3 px-4 py-4 sm:px-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <KeyRound className="size-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h3 id="ai-key-heading" className="font-heading text-base font-medium">
              AI key
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Sastra sends AI work to OpenRouter with this key. The key is stored
              encrypted and is never shown again.
            </p>
          </div>

          <p className="text-sm" aria-live="polite">
            {hasStored ? (
              <>
                <span className="font-medium">Key saved.</span> Ends in{" "}
                <code className="rounded bg-muted px-1 font-mono text-xs">
                  ••••{stored.last4}
                </code>
                {updatedLabel ? ` · Updated ${updatedLabel}` : null}
                {status.envConfigured
                  ? ". This key is used instead of the server key."
                  : "."}
              </>
            ) : unreadable ? (
              <span className="text-destructive">
                A saved key cannot be read. The server encryption key may have
                changed. Enter the key again.
              </span>
            ) : status.envConfigured ? (
              <>
                <span className="font-medium">Using the server key.</span> Add a
                key here to use your own OpenRouter account instead.
              </>
            ) : (
              <span className="text-destructive">
                No AI key set. AI features are off until you add one.
              </span>
            )}
          </p>

          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor={inputId} className="text-xs">
                {hasStored ? "New AI key" : "AI key"}
              </Label>
              <Input
                id={inputId}
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-or-v1-…"
                value={draft}
                disabled={saving}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? `${inputId}-error` : undefined}
                onChange={(event) => {
                  setDraft(event.target.value);
                  if (fieldError) setFieldError(null);
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={saving || !draft.trim()}>
                {saving ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Saving…
                  </>
                ) : hasStored ? (
                  "Replace key"
                ) : (
                  "Save key"
                )}
              </Button>
              {hasStored || unreadable ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={removing || saving}
                  onClick={remove}
                >
                  <Trash2 />
                  Remove key
                </Button>
              ) : null}
            </div>
          </form>
          {fieldError ? (
            <p id={`${inputId}-error`} className="text-sm text-destructive" role="alert">
              {fieldError}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Get a key at openrouter.ai under Keys. It starts with{" "}
            <code className="font-mono">sk-or-</code>. If no key is saved here,
            Sastra uses the server key from the deployment settings.
          </p>
        </div>
      </div>
    </section>
  );
}

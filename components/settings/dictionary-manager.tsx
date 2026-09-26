"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mic, Pencil, Plus, X } from "lucide-react";

import {
  addDictionaryTerm,
  removeDictionaryTerm,
  updateDictionaryTermAliases,
  type DictionaryTerm,
} from "@/lib/dictionary/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePropState } from "@/hooks/use-prop-state";

export function DictionaryManager({ terms }: { terms: DictionaryTerm[] }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [visibleTerms, setVisibleTerms] = usePropState(terms);
  const [editingTerm, setEditingTerm] = useState<DictionaryTerm | null>(null);
  const [aliasValue, setAliasValue] = useState("");
  const [pending, start] = useTransition();

  function add() {
    const term = value.trim();
    if (!term) return;
    const previous = visibleTerms;
    const temporaryId = `pending-${crypto.randomUUID()}`;
    setVisibleTerms((current) =>
      [
        ...current,
        { id: temporaryId, term, aliases: [], createdAt: new Date() },
      ].sort((a, b) => a.term.localeCompare(b.term))
    );
    setValue("");
    start(async () => {
      try {
        const res = await addDictionaryTerm(term);
        if (res.error) throw new Error(res.error);
        if (res.id) {
          setVisibleTerms((current) =>
            current.map((item) =>
              item.id === temporaryId ? { ...item, id: res.id as string } : item
            )
          );
        }
        router.refresh();
      } catch (error) {
        setVisibleTerms(previous);
        setValue(term);
        toast.error(error instanceof Error ? error.message : "Could not add the term.");
      }
    });
  }

  async function remove(term: DictionaryTerm) {
    if (!(await confirmDialog(`Remove “${term.term}” from the dictionary?`))) return;
    const previous = visibleTerms;
    setVisibleTerms((current) => current.filter((item) => item.id !== term.id));
    start(async () => {
      try {
        await removeDictionaryTerm(term.id);
        router.refresh();
      } catch {
        setVisibleTerms(previous);
        toast.error("Could not remove the term.");
      }
    });
  }

  function openAliasEditor(term: DictionaryTerm) {
    setEditingTerm(term);
    setAliasValue(term.aliases.join("\n"));
  }

  function saveAliases() {
    if (!editingTerm) return;
    const aliases = aliasValue
      .split("\n")
      .map((alias) => alias.trim())
      .filter(Boolean);
    const previous = visibleTerms;
    const edited = editingTerm;
    setVisibleTerms((current) =>
      current.map((term) =>
        term.id === edited.id ? { ...term, aliases } : term
      )
    );
    setEditingTerm(null);
    start(async () => {
      try {
        const result = await updateDictionaryTermAliases(edited.id, aliases);
        if (result.error) throw new Error(result.error);
        router.refresh();
      } catch (error) {
        setVisibleTerms(previous);
        setEditingTerm(edited);
        setAliasValue(aliases.join("\n"));
        toast.error(
          error instanceof Error ? error.message : "Could not save aliases."
        );
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium">
            <Mic className="size-4" /> Voice dictionary
          </p>
          <p className="text-sm text-muted-foreground">
            Shared names and terms for everyone in this workspace (like proper nouns or your product name) that
            voice dictation should spell correctly. Your project and teammate
            names are already included automatically. Add a heard-as alias when
            transcription repeatedly guesses a different spelling.
          </p>
        </div>

        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Add a word or name…"
            className="flex-1"
          />
          <Button onClick={add} disabled={pending || !value.trim()}>
            <Plus className="size-4" />
            Add
          </Button>
        </div>

        {visibleTerms.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No custom terms yet. Add words here, or fix a task&apos;s wording and
            we&apos;ll offer to add the new word for you.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {visibleTerms.map((t) => (
              <li
                key={t.id}
                className={`inline-flex items-center gap-1 rounded-full border bg-card py-1 pl-3 pr-1 text-sm ${t.id.startsWith("pending-") ? "optimistic-item-in" : ""}`}
              >
                <span>{t.term}</span>
                {t.aliases.length > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    +{t.aliases.length}
                  </span>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Edit heard-as aliases for ${t.term}`}
                  onClick={() => openAliasEditor(t)}
                  disabled={pending || t.id.startsWith("pending-")}
                >
                  <Pencil className="size-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${t.term}`}
                  disabled={pending}
                  onClick={() => remove(t)}
                >
                  <X className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog
        open={editingTerm !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setEditingTerm(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Help dictation recognize “{editingTerm?.term}”</DialogTitle>
            <DialogDescription>
              Add only spellings the transcription actually returns. Exact
              whole-word matches will be corrected to “{editingTerm?.term}”.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="dictionary-aliases">Heard-as spellings</Label>
            <Textarea
              id="dictionary-aliases"
              value={aliasValue}
              onChange={(event) => setAliasValue(event.target.value)}
              placeholder={"Bra\nBarra\nBorra"}
              rows={5}
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              One spelling per line, up to 10. Short common words should only be
              added when they are a consistent transcription mistake.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingTerm(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={saveAliases} disabled={pending}>
              Save aliases
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

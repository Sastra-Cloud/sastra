"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useState, useTransition } from "react";
import { Brain, Check, Pencil, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  clearAssistantMemory,
  editAssistantMemoryFact,
  reviewAssistantMemoryFact,
  setAssistantMemoryEnabled,
} from "@/lib/assistant/actions";
import type { MemoryFact } from "@/lib/assistant/memory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { usePropState } from "@/hooks/use-prop-state";

type MemoryState = { enabled: boolean; facts: MemoryFact[] };

export function MemoryManager({ state }: { state: MemoryState }) {
  const router = useRouter();
  const [memory, setMemory] = usePropState(state);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<MemoryFact | null>(null);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<MemoryFact["category"]>("preference");
  const candidates = memory.facts.filter((fact) => fact.status === "candidate");
  const visible = memory.facts.filter((fact) => fact.status !== "archived");

  function run(
    action: () => Promise<void>,
    success: string,
    optimistic?: (current: MemoryState) => MemoryState
  ) {
    const previous = memory;
    if (optimistic) setMemory(optimistic);
    startTransition(async () => {
      try {
        await action();
        toast.success(success);
        router.refresh();
      } catch (error) {
        if (optimistic) setMemory(previous);
        toast.error(error instanceof Error ? error.message : "Memory update failed");
      }
    });
  }

  function beginEdit(fact: MemoryFact) {
    setEditing(fact);
    setContent(fact.content);
    setCategory(fact.category);
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm" aria-label="Review assistant memory" />
        }
      >
        <Brain className="size-4" />
        Memory
        {candidates.length > 0 ? (
          <Badge variant="secondary" className="ml-0.5 px-1.5 text-[10px]">
            {candidates.length}
          </Badge>
        ) : null}
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assistant memory</DialogTitle>
          <DialogDescription>
            Only active facts are used. Conversation summaries and shared procedural
            lessons are stored separately.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 p-3">
          <div>
            <p className="text-sm font-medium">
              Memory is {memory.enabled ? "enabled" : "disabled"}
            </p>
            <p className="text-xs text-muted-foreground">
              Tool output and correspondence can never become user memory.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () => setAssistantMemoryEnabled(!memory.enabled),
                memory.enabled ? "Memory disabled" : "Memory enabled",
                (current) => ({ ...current, enabled: !current.enabled })
              )
            }
          >
            {memory.enabled ? "Disable" : "Enable"}
          </Button>
        </div>

        {visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing is stored about you.
          </p>
        ) : (
          <div className="space-y-2">
            {visible.map((fact) => (
              <div key={fact.id} className="rounded-lg border p-3">
                {editing?.id === fact.id ? (
                  <div className="space-y-2">
                    <Select
                      value={category}
                      onValueChange={(value) =>
                        value && setCategory(value as MemoryFact["category"])
                      }
                    >
                      <SelectTrigger className="w-full sm:w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="preference">Preference</SelectItem>
                        <SelectItem value="profile">Profile</SelectItem>
                        <SelectItem value="working_style">Working style</SelectItem>
                      </SelectContent>
                    </Select>
                    <Textarea
                      value={content}
                      onChange={(event) => setContent(event.target.value)}
                      rows={4}
                      maxLength={500}
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={pending || !content.trim()}
                        onClick={() =>
                          run(
                            async () => {
                              await editAssistantMemoryFact(
                                fact.id,
                                content,
                                category
                              );
                              setEditing(null);
                            },
                            "Memory updated",
                            (current) => ({
                              ...current,
                              facts: current.facts.map((item) =>
                                item.id === fact.id
                                  ? { ...item, content: content.trim(), category }
                                  : item
                              ),
                            })
                          )
                        }
                      >
                        <Check className="size-4" /> Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">{fact.category.replace("_", " ")}</Badge>
                      <Badge variant={fact.status === "active" ? "secondary" : "outline"}>
                        {fact.status}
                      </Badge>
                    </div>
                    <p className="text-sm">{fact.content}</p>
                    <div className="flex flex-wrap justify-end gap-1">
                      {fact.status === "candidate" ? (
                        <>
                          <Button
                            size="xs"
                            disabled={pending}
                            onClick={() =>
                              run(
                                () => reviewAssistantMemoryFact(fact.id, "active"),
                                "Memory approved",
                                (current) => ({
                                  ...current,
                                  facts: current.facts.map((item) =>
                                    item.id === fact.id
                                      ? { ...item, status: "active" }
                                      : item
                                  ),
                                })
                              )
                            }
                          >
                            <Check className="size-3.5" /> Approve
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            disabled={pending}
                            onClick={() =>
                              run(
                                () => reviewAssistantMemoryFact(fact.id, "rejected"),
                                "Memory rejected",
                                (current) => ({
                                  ...current,
                                  facts: current.facts.map((item) =>
                                    item.id === fact.id
                                      ? { ...item, status: "rejected" }
                                      : item
                                  ),
                                })
                              )
                            }
                          >
                            <X className="size-3.5" /> Reject
                          </Button>
                        </>
                      ) : null}
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label="Edit memory fact"
                        onClick={() => beginEdit(fact)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label="Remove memory fact"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () => reviewAssistantMemoryFact(fact.id, "archived"),
                            "Memory removed",
                            (current) => ({
                              ...current,
                              facts: current.facts.map((item) =>
                                item.id === fact.id
                                  ? { ...item, status: "archived" }
                                  : item
                              ),
                            })
                          )
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {memory.facts.length > 0 ? (
          <div className="flex justify-end border-t pt-3">
            <Button
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={async () => {
                if ((await confirmDialog("Delete every assistant memory fact?"))) {
                  run(clearAssistantMemory, "All memory deleted", (current) => ({
                    ...current,
                    facts: [],
                  }));
                }
              }}
            >
              <Trash2 className="size-4" /> Delete all memory
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileCheck2, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  acceptEmailProjectUpdateSuggestion,
  dismissEmailProjectUpdateSuggestion,
} from "@/lib/email/actions";
import type { ProjectUpdateSuggestionData } from "@/lib/email/project-update-suggestion-policy";

type Suggestion = ProjectUpdateSuggestionData & { suggestionId: string };

export function ProjectUpdateSuggestions({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
  if (!suggestions.length) return null;
  return (
    <div className="space-y-3" aria-label="Suggested project status updates">
      {suggestions.map((suggestion) => (
        <ProjectUpdateSuggestionCard
          key={suggestion.suggestionId}
          suggestion={suggestion}
        />
      ))}
    </div>
  );
}

function ProjectUpdateSuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const router = useRouter();
  const [body, setBody] = useState(suggestion.suggestedBody);
  const [visible, setVisible] = useState(true);
  const [pending, startTransition] = useTransition();
  if (!visible) return null;

  const post = () => {
    const update = body.trim();
    if (!update) return;
    startTransition(async () => {
      try {
        const result = await acceptEmailProjectUpdateSuggestion(
          suggestion.suggestionId,
          update
        );
        if (result.error) throw new Error(result.error);
        setVisible(false);
        toast.success(`Posted a status update to ${suggestion.projectTitle}.`);
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not post the project update."
        );
      }
    });
  };

  const dismiss = () => {
    setVisible(false);
    startTransition(async () => {
      try {
        const result = await dismissEmailProjectUpdateSuggestion(
          suggestion.suggestionId
        );
        if (result.error) throw new Error(result.error);
        router.refresh();
      } catch (error) {
        setVisible(true);
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not dismiss the suggestion."
        );
      }
    });
  };

  return (
    <section className="rounded-xl border border-primary/25 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <FileCheck2 className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-medium">
              Suggested project status update
            </p>
            <Link
              href={`/projects/${suggestion.projectSlug}`}
              className="text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              {suggestion.projectTitle}
            </Link>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {suggestion.reason}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Dismiss project update suggestion"
          onClick={dismiss}
          disabled={pending}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="mt-3 space-y-3 pl-0 sm:pl-12">
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={3}
          aria-label={`Suggested status update for ${suggestion.projectTitle}`}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Review first · posting adds this to the project overview.
          </p>
          <Button
            type="button"
            size="sm"
            onClick={post}
            disabled={pending || !body.trim()}
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {pending ? "Posting…" : "Post update"}
          </Button>
        </div>
      </div>
    </section>
  );
}

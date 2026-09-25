"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import {
  createProjectsFromThread,
  dismissAllProjectSuggestions,
  dismissProjectSuggestion,
  linkThreadToProjects,
} from "@/lib/email/actions";
import { matchProjects } from "@/lib/imports/match";
import type { PendingProjectSuggestion } from "@/lib/email/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ProjectKind =
  | "book"
  | "article"
  | "podcast"
  | "video_series"
  | "other";
type ExistingProject = { id: string; title: string; slug: string };

type Row = {
  id: string;
  title: string;
  kind: ProjectKind;
  videoProductionMode: "original" | "translation" | null;
  description: string;
  include: boolean;
};

const KIND_LABEL: Record<ProjectKind, string> = {
  book: "Book",
  article: "Article",
  podcast: "Podcast",
  video_series: "Video series",
  other: "Other",
};

export function ProjectSuggestionReview({
  threadId,
  suggestions,
  existingProjects,
  grantMatch,
}: {
  threadId: string;
  suggestions: PendingProjectSuggestion[];
  existingProjects: ExistingProject[];
  /** Set when the email's funder already funds existing projects (a known grant). */
  grantMatch?: { funderName: string; projects: ExistingProject[] } | null;
}) {
  const router = useRouter();
  const [linking, startLinking] = useTransition();
  const [rows, setRows] = useState<Row[]>(() =>
    suggestions.map((suggestion) => ({
      id: suggestion.id,
      title: suggestion.title,
      kind: suggestion.kind,
      videoProductionMode: suggestion.videoProductionMode,
      description: suggestion.reason,
      include: true,
    }))
  );
  const [dismissReason, setDismissReason] = useState("");
  const [committing, startCommit] = useTransition();
  const [dismissingAll, startDismissAll] = useTransition();

  const setRow = (id: string, patch: Partial<Row>) =>
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );

  const includedCount = rows.filter((row) => row.include && row.title.trim()).length;

  const create = () => {
    const candidates = rows
      .filter((row) => row.include && row.title.trim())
      .map((row) => ({
        suggestionId: row.id,
        title: row.title.trim(),
        description: row.description.trim() || undefined,
        kind: row.kind,
        videoProductionMode:
          row.kind === "video_series" ? row.videoProductionMode ?? "original" : null,
      }));
    if (!candidates.length) return;
    startCommit(async () => {
      const result = await createProjectsFromThread({ threadId, candidates });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const n = result.projects?.length ?? candidates.length;
      toast.success(`Created ${n} project${n === 1 ? "" : "s"} from this email.`);
      router.push(`/correspondence/${threadId}`);
      router.refresh();
    });
  };

  const dismissOne = (id: string) => {
    const snapshot = rows;
    setRows((current) => current.filter((row) => row.id !== id));
    startCommit(async () => {
      const result = await dismissProjectSuggestion(id);
      if (result.error) {
        setRows(snapshot);
        toast.error(result.error);
      }
    });
  };

  const dismissAll = () => {
    startDismissAll(async () => {
      const result = await dismissAllProjectSuggestions(
        threadId,
        dismissReason.trim() || undefined
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Dismissed the suggested projects.");
      router.push(`/correspondence/${threadId}`);
      router.refresh();
    });
  };

  const linkToGrant = () => {
    if (!grantMatch) return;
    startLinking(async () => {
      const result = await linkThreadToProjects(
        threadId,
        grantMatch.projects.map((project) => project.id)
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Linked the email to ${grantMatch.projects.length} existing project${
          grantMatch.projects.length === 1 ? "" : "s"
        }.`
      );
      router.push(`/correspondence/${threadId}`);
      router.refresh();
    });
  };

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Sparkles className="size-5" />
          </span>
          <p className="text-sm text-muted-foreground">
            There are no projects waiting for review on this email.
          </p>
          <Link
            href={`/correspondence/${threadId}`}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Back to the email
          </Link>
        </CardContent>
      </Card>
    );
  }

  const busy = committing || dismissingAll || linking;

  return (
    <div className="space-y-4">
      {grantMatch ? (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="space-y-3 py-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <div className="space-y-1">
                <p className="font-medium">
                  {grantMatch.funderName} already funds{" "}
                  {grantMatch.projects.length} existing project
                  {grantMatch.projects.length === 1 ? "" : "s"}
                </p>
                <p className="text-sm text-muted-foreground">
                  The suggestions below are likely part of that grant, not new
                  work. Link this email to those projects instead of creating
                  duplicates:{" "}
                  <span className="text-foreground">
                    {grantMatch.projects.map((project) => project.title).join(", ")}
                  </span>
                  .
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={linkToGrant} disabled={busy}>
                {linking ? <Loader2 className="size-4 animate-spin" /> : null}
                Link the email to {grantMatch.projects.length} project
                {grantMatch.projects.length === 1 ? "" : "s"}
              </Button>
              <Button variant="ghost" onClick={dismissAll} disabled={busy}>
                Dismiss suggestions
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-3">
        {rows.map((row) => {
          const duplicates = matchProjects(row.title, existingProjects);
          return (
            <Card key={row.id} className={row.include ? "" : "opacity-60"}>
              <CardContent className="space-y-4 py-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-2.5 size-4 shrink-0 accent-primary"
                    checked={row.include}
                    aria-label={`Create ${row.title || "this project"}`}
                    onChange={(event) =>
                      setRow(row.id, { include: event.target.checked })
                    }
                  />
                  <div className="grid flex-1 gap-1.5">
                    <Label htmlFor={`title-${row.id}`}>Project title</Label>
                    <Input
                      id={`title-${row.id}`}
                      value={row.title}
                      maxLength={200}
                      onChange={(event) =>
                        setRow(row.id, { title: event.target.value })
                      }
                      className="font-medium"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Dismiss ${row.title || "suggestion"}`}
                    className="mt-1.5"
                    disabled={busy}
                    onClick={() => dismissOne(row.id)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>

                {duplicates.length > 0 ? (
                  <div className="ml-7 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-2.5 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      Possible duplicate of an existing project:{" "}
                      {duplicates
                        .slice(0, 3)
                        .map((match) => match.project.title)
                        .join(", ")}
                      . Creating this will add a new, separate project.
                    </span>
                  </div>
                ) : null}

                <div className="ml-7 grid gap-3 sm:grid-cols-[10rem_1fr]">
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <Select
                      value={row.kind}
                      onValueChange={(value) =>
                        setRow(row.id, {
                          kind: (value ?? "other") as ProjectKind,
                          videoProductionMode:
                            value === "video_series"
                              ? row.videoProductionMode ?? "original"
                              : null,
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(value: string | null) =>
                            KIND_LABEL[(value ?? "other") as ProjectKind]
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="book">Book</SelectItem>
                        <SelectItem value="article">Article</SelectItem>
                        <SelectItem value="podcast">Podcast</SelectItem>
                        <SelectItem value="video_series">Video series</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    {row.kind === "video_series" ? (
                      <Select
                        value={row.videoProductionMode ?? "original"}
                        onValueChange={(value) =>
                          setRow(row.id, {
                            videoProductionMode:
                              value === "translation" ? "translation" : "original",
                          })
                        }
                      >
                        <SelectTrigger className="mt-2 w-full" aria-label="Video production mode">
                          <SelectValue>
                            {(value: string | null) =>
                              value === "translation" ? "Translation" : "Original"
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="original">Original</SelectItem>
                          <SelectItem value="translation">Translation</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`desc-${row.id}`}>Goal / description</Label>
                    <Textarea
                      id={`desc-${row.id}`}
                      value={row.description}
                      rows={3}
                      maxLength={2_000}
                      onChange={(event) =>
                        setRow(row.id, { description: event.target.value })
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        <Input
          value={dismissReason}
          onChange={(event) => setDismissReason(event.target.value)}
          maxLength={300}
          placeholder="Why isn't this a new project? (optional)"
          aria-label="Reason for dismissing these suggestions"
          className="h-9 flex-1 sm:min-w-[16rem]"
        />
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={dismissAll}
        >
          {dismissingAll ? <Loader2 className="size-4 animate-spin" /> : null}
          Dismiss all
        </Button>
        <Button type="button" disabled={busy || includedCount === 0} onClick={create}>
          {committing ? <Loader2 className="size-4 animate-spin" /> : null}
          {committing
            ? "Creating…"
            : `Create ${includedCount} project${includedCount === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
}

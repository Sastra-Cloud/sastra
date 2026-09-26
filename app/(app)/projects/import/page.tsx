import Link from "next/link";
import { AlertTriangle, FileText, Loader2 } from "lucide-react";

import { AiSetupGuidance } from "@/components/ai/ai-setup-guidance";
import { getOpenRouterApiKeyStatus } from "@/lib/ai/keys";
import { requireRole } from "@/lib/auth/guards";
import { listImports } from "@/lib/imports/queries";
import { norm } from "@/lib/imports/match";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ImportUploader } from "@/components/imports/import-uploader";
import { ImportListRefresh } from "@/components/imports/import-list-refresh";
import { RetryImportButton } from "@/components/imports/retry-import-button";
import { DiscardImportButton } from "@/components/imports/discard-import-button";
import { ContentColumn, PageShell } from "@/components/cockpit";

export const metadata = { title: "Import from document" };
export const dynamic = "force-dynamic";

const STATUS: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  uploaded: { label: "Not parsed", variant: "outline" },
  parsing: { label: "Parsing…", variant: "secondary" },
  extracted: { label: "Ready to review", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
  committed: { label: "Committed", variant: "default" },
  discarded: { label: "Discarded", variant: "outline" },
};

/** Compact relative age, e.g. "45s", "3m", "2h". */
function ago(d: Date): string {
  const secs = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

export default async function ImportPage() {
  const { user } = await requireRole("manager");
  const aiReady = (await getOpenRouterApiKeyStatus()).source !== "none";
  // Show only actionable drafts — committed/discarded imports drop off the list
  // (the projects they created live on the Projects page).
  const imports = (await listImports()).filter(
    (i) => i.status !== "discarded" && i.status !== "committed"
  );

  // Keep the list live while anything is still parsing.
  const active = imports.some(
    (i) => i.status === "parsing" || i.status === "uploaded"
  );

  // Flag create-mode drafts whose titles look like the same work, so the user
  // commits one and updates from the rest instead of creating duplicates.
  const dupCount = new Map<string, { title: string; count: number }>();
  for (const imp of imports) {
    if (imp.status !== "extracted" || imp.targetProjectId || !imp.firstTitle)
      continue;
    const key = norm(imp.firstTitle);
    if (!key) continue;
    const g = dupCount.get(key);
    if (g) g.count += 1;
    else dupCount.set(key, { title: imp.firstTitle, count: 1 });
  }
  const dupGroups = [...dupCount.values()].filter((g) => g.count >= 2);
  const dupKeys = new Set(
    [...dupCount.entries()].filter(([, g]) => g.count >= 2).map(([k]) => k)
  );

  return (
    <PageShell>
      <ImportListRefresh active={active} />

      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Import from a document
        </h1>
        <p className="text-muted-foreground">
          Upload an MOU, license, or grant agreement. AI extracts the projects,
          budget, and rights — you review and edit before anything is created.
        </p>
      </div>

      <ContentColumn width="focused" className="space-y-6">
        <Card>
          <CardContent className="py-6">
            {aiReady ? <ImportUploader /> : <AiSetupGuidance role={user.role} />}
          </CardContent>
        </Card>

        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Recent imports
          </h2>

          {dupGroups.map((g) => (
            <div
              key={g.title}
              className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <p>
                <span className="font-medium">{g.count} documents</span> look like
                the same book: <span className="font-medium">“{g.title}”</span>.
                Commit one to create the project — the others will then offer to{" "}
                <span className="font-medium">update</span> it instead of creating
                a duplicate.
              </p>
            </div>
          ))}

          {imports.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <FileText className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No imports yet. Upload a document to get started.
                </p>
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-1.5">
              {imports.map((imp) => {
              const s = STATUS[imp.status] ?? STATUS.uploaded;
              const isDup =
                imp.status === "extracted" &&
                !imp.targetProjectId &&
                !!imp.firstTitle &&
                dupKeys.has(norm(imp.firstTitle));
              return (
                <li
                  key={imp.id}
                  className="flex items-center gap-3 rounded-md border bg-card px-3 py-2.5 transition-colors hover:bg-muted/60"
                >
                  <Link
                    href={`/projects/import/${imp.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {imp.fileName ?? "Document"}
                    </span>
                  </Link>

                  <div className="flex shrink-0 items-center gap-2">
                    {isDup ? (
                      <Badge
                        variant="outline"
                        className="border-warning/50 text-warning"
                      >
                        Possible duplicate
                      </Badge>
                    ) : null}

                    {imp.status === "committed" && imp.committedCount > 0 ? (
                      <span className="text-xs text-muted-foreground">
                        {imp.committedCount} project
                        {imp.committedCount === 1 ? "" : "s"}
                      </span>
                    ) : imp.status === "extracted" && imp.projectCount > 0 ? (
                      <span className="text-xs text-muted-foreground">
                        {imp.projectCount} found
                      </span>
                    ) : null}

                    {imp.status === "parsing" ? (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" />
                        Parsing… · started {ago(imp.createdAt)} ago
                      </span>
                    ) : imp.status === "failed" ? (
                      <>
                        <Badge
                          variant="destructive"
                          title={imp.error ?? undefined}
                        >
                          Failed
                        </Badge>
                        <RetryImportButton importId={imp.id} />
                      </>
                    ) : (
                      <Badge variant={s.variant}>{s.label}</Badge>
                    )}

                    <DiscardImportButton
                      importId={imp.id}
                      status={imp.status}
                      fileName={imp.fileName}
                    />
                  </div>
                </li>
              );
              })}
            </ul>
          )}
        </div>
      </ContentColumn>
    </PageShell>
  );
}

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  BookOpenText,
  ChevronRight,
  FilePlus2,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  createWikiPage,
  createWikiSubject,
  reorderWikiPages,
  reorderWikiSubjects,
  updateWikiSubject,
} from "@/lib/wiki/actions";
import type { WikiTreeSubject } from "@/lib/wiki/queries";
import { cn } from "@/lib/utils";
import { usePropState } from "@/hooks/use-prop-state";

export function WikiWorkspace({
  tree: serverTree,
  canEdit,
  children,
}: {
  tree: WikiTreeSubject[];
  canEdit: boolean;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const [collapseState, setCollapseState] = useState<{
    pathname: string;
    subjectIds: Set<string>;
  }>(() => ({ pathname, subjectIds: new Set() }));

  const activeSubjectId = serverTree.find((subject) =>
    pathname.startsWith(`/wiki/${subject.slug}/`)
  )?.id;

  function isSubjectExpanded(subjectId: string) {
    if (
      collapseState.pathname !== pathname &&
      activeSubjectId === subjectId
    ) {
      return true;
    }
    return !collapseState.subjectIds.has(subjectId);
  }

  function toggleSubject(subjectId: string) {
    setCollapseState((current) => {
      const subjectIds = new Set(current.subjectIds);
      if (current.pathname !== pathname && activeSubjectId) {
        subjectIds.delete(activeSubjectId);
      }
      if (subjectIds.has(subjectId)) {
        subjectIds.delete(subjectId);
      } else {
        subjectIds.add(subjectId);
      }
      return { pathname, subjectIds };
    });
  }

  return (
    <div className="@container/wiki w-full min-w-0">
      <div className="mb-4 flex items-center gap-2 @[72rem]/wiki:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger render={<Button variant="outline" className="min-h-11" />}>
            <Menu /> Browse wiki
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-[min(88vw,22rem)] overflow-x-hidden overflow-y-auto overscroll-contain"
          >
            <SheetHeader>
              <SheetTitle>Wiki</SheetTitle>
              <SheetDescription>Subjects and tutorial pages</SheetDescription>
            </SheetHeader>
            <WikiNavigation
              tree={serverTree}
              canEdit={canEdit}
              placement="sheet"
              onNavigate={() => setMobileOpen(false)}
              isSubjectExpanded={isSubjectExpanded}
              onToggleSubject={toggleSubject}
            />
          </SheetContent>
        </Sheet>
      </div>
      <div className="grid min-w-0 gap-6 @[72rem]/wiki:grid-cols-[18rem_minmax(0,1fr)] @[92rem]/wiki:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="hidden @[72rem]/wiki:block">
          <div className="sticky top-5 max-h-[calc(100vh-2.5rem)] overflow-y-auto rounded-xl border bg-card p-3 shadow-sm">
            <WikiNavigation
              tree={serverTree}
              canEdit={canEdit}
              placement="sidebar"
              isSubjectExpanded={isSubjectExpanded}
              onToggleSubject={toggleSubject}
            />
          </div>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}

function WikiNavigation({
  tree: serverTree,
  canEdit,
  placement,
  onNavigate,
  isSubjectExpanded,
  onToggleSubject,
}: {
  tree: WikiTreeSubject[];
  canEdit: boolean;
  placement: "sheet" | "sidebar";
  onNavigate?: () => void;
  isSubjectExpanded: (subjectId: string) => boolean;
  onToggleSubject: (subjectId: string) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [tree, setTree] = usePropState(serverTree);
  const [pending, start] = useTransition();

  function moveSubject(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= tree.length) return;
    const previous = tree;
    const next = [...tree];
    [next[index], next[target]] = [next[target], next[index]];
    setTree(next);
    start(async () => {
      const result = await reorderWikiSubjects(next.map((item) => item.id));
      if (!result.ok) {
        setTree(previous);
        toast.error(result.error.message);
      }
    });
  }

  function movePage(subjectIndex: number, pageIndex: number, direction: -1 | 1) {
    const subject = tree[subjectIndex];
    const target = pageIndex + direction;
    if (target < 0 || target >= subject.pages.length) return;
    const previous = tree;
    const pages = [...subject.pages];
    [pages[pageIndex], pages[target]] = [pages[target], pages[pageIndex]];
    const next = tree.map((item, index) =>
      index === subjectIndex ? { ...item, pages } : item
    );
    setTree(next);
    start(async () => {
      const result = await reorderWikiPages({
        subjectId: subject.id,
        pageIds: pages.map((item) => item.id),
      });
      if (!result.ok) {
        setTree(previous);
        toast.error(result.error.message);
      }
    });
  }

  return (
    <nav
      aria-label="Wiki pages"
      className={cn(
        "grid w-full min-w-0 max-w-full gap-4 overflow-x-hidden",
        placement === "sheet"
          ? "px-4 pb-5 [&_a]:min-h-11"
          : "px-0 pb-0"
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <Link
          href="/wiki"
          onClick={onNavigate}
          className="flex min-h-10 items-center gap-2 rounded-lg px-2 font-heading text-base font-semibold hover:bg-muted"
        >
          <BookOpenText className="size-5 text-primary" /> Wiki
        </Link>
        {canEdit ? <CreateSubjectDialog /> : null}
      </div>
      <Link
        href="/wiki?q="
        onClick={onNavigate}
        className="flex min-h-10 items-center gap-2 rounded-lg border bg-background px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <Search className="size-4" /> Search pages
      </Link>
      <div className="grid min-w-0 gap-3">
        {tree.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">
            {canEdit ? "Create the first subject to begin." : "No pages have been published yet."}
          </p>
        ) : null}
        {tree.map((subject, subjectIndex) => {
          const expanded = isSubjectExpanded(subject.id);
          const pagesId = `wiki-subject-${subject.id}-pages`;
          return (
            <div key={subject.id} className="group/subject grid min-w-0 gap-1">
              <div className="flex min-h-9 min-w-0 items-center gap-1 rounded-lg px-1 hover:bg-muted/60 pointer-coarse:min-h-11">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={pagesId}
                  className="flex min-h-9 min-w-0 flex-1 items-center gap-1 rounded-md px-1 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
                  onClick={() => onToggleSubject(subject.id)}
                >
                  <ChevronRight
                    aria-hidden="true"
                    className={cn(
                      "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
                      expanded && "rotate-90"
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {subject.title}
                  </span>
                  {!expanded ? (
                    <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[0.68rem] font-medium tabular-nums text-muted-foreground">
                      {subject.pages.length}
                      <span className="sr-only">
                        {subject.pages.length === 1 ? " page" : " pages"}
                      </span>
                    </span>
                  ) : null}
                </button>
                {canEdit ? (
                  <div className="flex shrink-0 items-center">
                    <CreatePageDialog subject={subject} />
                    <div className="hidden items-center group-hover/subject:flex group-focus-within/subject:flex pointer-coarse:flex">
                      <MoveButtons
                        label={subject.title}
                        first={subjectIndex === 0}
                        last={subjectIndex === tree.length - 1}
                        disabled={pending}
                        onMove={(direction) => moveSubject(subjectIndex, direction)}
                      />
                      <EditSubjectDialog
                        subject={subject}
                        onSaved={() => router.refresh()}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
              <div
                id={pagesId}
                className={cn(
                  "ml-3 min-w-0 border-l pl-2",
                  expanded ? "grid" : "hidden"
                )}
              >
                {subject.pages.map((page, pageIndex) => {
                  const viewHref = `/wiki/${subject.slug}/${page.slug}`;
                  const href = page.published ? viewHref : `${viewHref}/edit`;
                  const active =
                    pathname === viewHref || pathname === `${viewHref}/edit`;
                  return (
                    <div key={page.id} className="group/page flex min-w-0 items-center gap-1">
                      <Link
                        href={href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-sm transition-colors",
                          active
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{page.title}</span>
                        {!page.published ? (
                          <span className="ml-auto rounded-full bg-warning/15 px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-warning-text">Draft</span>
                        ) : page.hasUnpublishedChanges && canEdit ? (
                          <span className="ml-auto size-1.5 rounded-full bg-warning" title="Unpublished changes" />
                        ) : null}
                      </Link>
                      {canEdit && subject.pages.length > 1 ? (
                        <span className="shrink-0 opacity-0 transition-opacity group-hover/page:opacity-100 focus-within:opacity-100">
                          <MoveButtons
                            label={page.title}
                            first={pageIndex === 0}
                            last={pageIndex === subject.pages.length - 1}
                            disabled={pending}
                            onMove={(direction) =>
                              movePage(subjectIndex, pageIndex, direction)
                            }
                          />
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {canEdit ? (
        <Link href="/wiki/trash" onClick={onNavigate} className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
          <Trash2 className="size-4" /> Trash
        </Link>
      ) : null}
    </nav>
  );
}

function MoveButtons({
  label,
  first,
  last,
  disabled,
  onMove,
}: {
  label: string;
  first: boolean;
  last: boolean;
  disabled: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <>
      {!first ? <Button variant="ghost" size="icon-xs" className="pointer-coarse:size-11" disabled={disabled} aria-label={`Move ${label} up`} onClick={() => onMove(-1)}><ArrowUp /></Button> : null}
      {!last ? <Button variant="ghost" size="icon-xs" className="pointer-coarse:size-11" disabled={disabled} aria-label={`Move ${label} down`} onClick={() => onMove(1)}><ArrowDown /></Button> : null}
    </>
  );
}

export function CreateSubjectDialog({
  trigger = "icon",
}: {
  trigger?: "icon" | "button";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      const result = await createWikiSubject({ title, description });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setOpen(false);
      setTitle("");
      setDescription("");
      toast.success("Wiki subject created");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger === "button" ? (
        <DialogTrigger render={<Button className="w-full sm:w-auto" />}>
          <Plus /> Create subject
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Create wiki subject" />}>
          <Plus />
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader><DialogTitle>New wiki subject</DialogTitle><DialogDescription>Use a broad area that can hold several related tutorials.</DialogDescription></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2"><Label htmlFor="wiki-subject-title">Subject name</Label><Input id="wiki-subject-title" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus /></div>
          <div className="grid gap-2"><Label htmlFor="wiki-subject-description">Description</Label><Textarea id="wiki-subject-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!title.trim() || pending} onClick={submit}>{pending ? "Creating…" : "Create subject"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditSubjectDialog({ subject, onSaved }: { subject: WikiTreeSubject; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(subject.title);
  const [description, setDescription] = useState(subject.description ?? "");
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      const result = await updateWikiSubject({ id: subject.id, title, description });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setOpen(false);
      toast.success("Subject updated");
      onSaved();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-xs" className="pointer-coarse:size-11" aria-label={`Edit ${subject.title}`} />}><MoreHorizontal /></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit wiki subject</DialogTitle><DialogDescription>The URL stays stable when the subject name changes.</DialogDescription></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2"><Label htmlFor={`subject-title-${subject.id}`}>Subject name</Label><Input id={`subject-title-${subject.id}`} value={title} onChange={(event) => setTitle(event.target.value)} /></div>
          <div className="grid gap-2"><Label htmlFor={`subject-description-${subject.id}`}>Description</Label><Textarea id={`subject-description-${subject.id}`} value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!title.trim() || pending} onClick={submit}>{pending ? "Saving…" : "Save changes"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CreatePageDialog({ subject }: { subject: WikiTreeSubject }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState(true);
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      const result = await createWikiPage({ subjectId: subject.id, title, tutorialTemplate: template });
      if (!result.ok || !result.data) {
        toast.error(result.ok ? "The wiki draft could not be opened." : result.error.message);
        return;
      }
      setOpen(false);
      setTitle("");
      toast.success("Wiki draft created");
      router.push(result.data.href);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" className="shrink-0 pointer-coarse:size-11" aria-label={`Add page to ${subject.title}`} title={`Add page to ${subject.title}`} />}><FilePlus2 /></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New tutorial page</DialogTitle><DialogDescription>Create a draft inside {subject.title}. Only managers can see it until it is published.</DialogDescription></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2"><Label htmlFor={`page-title-${subject.id}`}>Page title</Label><Input id={`page-title-${subject.id}`} value={title} onChange={(event) => setTitle(event.target.value)} autoFocus /></div>
          <label className="flex min-h-11 items-start gap-3 rounded-lg border p-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-4" checked={template} onChange={(event) => setTemplate(event.target.checked)} />
            <span><span className="block font-medium">Start with tutorial structure</span><span className="text-muted-foreground">Includes purpose, prerequisites, steps, verification, and troubleshooting.</span></span>
          </label>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!title.trim() || pending} onClick={submit}>{pending ? "Creating…" : "Create draft"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

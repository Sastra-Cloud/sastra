"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import {
  AlertTriangle,
  Bold,
  Check,
  CheckSquare2,
  Captions,
  Code2,
  FileVideo,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Lightbulb,
  Link2,
  List,
  ListOrdered,
  Loader2,
  MessageSquareWarning,
  Pilcrow,
  Quote,
  Redo2,
  Send,
  Strikethrough,
  SquarePlay,
  Trash2,
  Undo2,
  VolumeX,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
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
import { Textarea } from "@/components/ui/textarea";
import type { WikiDocument } from "@/lib/db/schema";
import {
  publishWikiPage,
  markWikiVideoNoSpeech,
  trashWikiPage,
  updateWikiPageDraft,
} from "@/lib/wiki/actions";
import { canonicalizeWikiEmbed } from "@/lib/wiki/content";
import { inspectWikiVideo } from "@/lib/wiki/video-client";
import type {
  WikiExternalEmbedAttrs,
  WikiExternalEmbedEditHandler,
} from "./wiki-external-embed-node-view";
import { createWikiEditorExtensions } from "./wiki-editor-extensions";
import { WikiRevisionHistory } from "./wiki-revision-history";

type MediaProgress = {
  id: string;
  mediaId?: string;
  label: string;
  percent: number;
  status: "uploading" | "processing" | "ready" | "failed";
  captionStatus?: "not_requested" | "generating" | "ready" | "failed" | "not_needed";
  videoReady?: boolean;
  error?: string;
};

function uploadWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress: (percent: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", contentType);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error("Upload failed"));
    request.onerror = () => reject(new Error("Upload failed"));
    request.send(file);
  });
}

export function WikiEditor({
  page,
  revisions,
  initialMedia,
  defaultLanguage,
}: {
  page: {
    id: string;
    subjectSlug: string;
    slug: string;
    title: string;
    summary: string | null;
    content: WikiDocument;
    version: number;
    publishedRevisionId: string | null;
  };
  revisions: Array<{
    id: string;
    revisionNumber: number;
    title: string;
    summary: string | null;
    publishedBy: string | null;
    createdAt: Date;
  }>;
  initialMedia: Array<{
    id: string;
    kind: "image" | "video";
    status: "pending" | "processing" | "ready" | "failed";
    captionStatus: "not_requested" | "generating" | "ready" | "failed" | "not_needed";
    originalName: string | null;
  }>;
  defaultLanguage: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(page.title);
  const [summary, setSummary] = useState(page.summary ?? "");
  const [version, setVersion] = useState(page.version);
  const versionRef = useRef(page.version);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [conflict, setConflict] = useState(false);
  const [publishing, startPublish] = useTransition();
  const [closing, startClose] = useTransition();
  const [media, setMedia] = useState<MediaProgress[]>(() =>
    initialMedia
      .filter((item) => item.kind === "video")
      .map((item) => ({
        id: item.id,
        mediaId: item.id,
        label: item.originalName ?? "Private video",
        percent: 100,
        captionStatus: item.captionStatus,
        videoReady: item.status === "ready",
        status:
          item.status === "failed"
            ? "failed"
            : item.status === "ready"
              ? "ready"
              : "processing",
      }))
  );
  const [imageOpen, setImageOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageAlt, setImageAlt] = useState("");
  const [imageCaption, setImageCaption] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreparing, setVideoPreparing] = useState(false);
  const [videoLanguage, setVideoLanguage] = useState(defaultLanguage);
  const [videoCaption, setVideoCaption] = useState("");
  const [embedUrl, setEmbedUrl] = useState("");
  const [embedCaption, setEmbedCaption] = useState("");
  const [editingEmbedPosition, setEditingEmbedPosition] = useState<number | null>(null);
  const [linkUrl, setLinkUrl] = useState("");

  const openEmbedEditor = useCallback<WikiExternalEmbedEditHandler>(
    ({ position, attrs }) => {
      setEditingEmbedPosition(position);
      setEmbedUrl(String(attrs.url ?? ""));
      setEmbedCaption(String(attrs.caption ?? ""));
      setEmbedOpen(true);
    },
    []
  );
  const editorExtensions = useMemo(
    () => createWikiEditorExtensions(openEmbedEditor),
    [openEmbedEditor]
  );

  const editor = useEditor({
    extensions: editorExtensions,
    content: page.content,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "wiki-prose wiki-editor-content min-h-[34rem] focus:outline-none",
        spellcheck: "true",
      },
    },
    onUpdate: () => {
      dirtyRef.current = true;
      setDirty(true);
    },
  }, [editorExtensions]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (!editor || conflict || !dirtyRef.current) return true;
    setSaving(true);
    let result: Awaited<ReturnType<typeof updateWikiPageDraft>>;
    try {
      result = await updateWikiPageDraft({
        pageId: page.id,
        expectedVersion: versionRef.current,
        title,
        summary: summary || null,
        content: JSON.parse(JSON.stringify(editor.getJSON())) as WikiDocument,
      });
    } catch {
      setSaving(false);
      toast.error("The draft could not be saved. Your work is still in this tab.");
      return false;
    }
    setSaving(false);
    if (!result.ok) {
      if (result.error.code === "WIKI_CONFLICT") setConflict(true);
      toast.error(result.error.message);
      return false;
    }
    const nextVersion = result.data?.version ?? versionRef.current + 1;
    versionRef.current = nextVersion;
    setVersion(nextVersion);
    dirtyRef.current = false;
    setDirty(false);
    setSavedAt(new Date(result.data?.updatedAt ?? Date.now()));
    router.refresh();
    return true;
  }, [conflict, editor, page.id, router, summary, title]);

  useEffect(() => {
    if (!dirty || conflict) return;
    const timer = window.setTimeout(() => void save(), 1500);
    return () => window.clearTimeout(timer);
  }, [dirty, conflict, save, title, summary]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  useEffect(() => {
    const pendingMedia = media.filter(
      (item) =>
        item.mediaId &&
        item.status === "processing" &&
        (!item.videoReady || item.captionStatus === "generating")
    );
    if (pendingMedia.length === 0) return;
    const timer = window.setInterval(() => {
      for (const item of pendingMedia) {
        void fetch(`/api/wiki/media/${item.mediaId}/status`, { cache: "no-store" })
          .then(async (response) => {
            if (!response.ok) return null;
            return (await response.json()) as {
              status: "pending" | "processing" | "ready" | "failed";
              captionStatus: MediaProgress["captionStatus"];
            };
          })
          .then((result) => {
            if (!result) return;
            updateMedia(item.id, {
              captionStatus: result.captionStatus,
              videoReady: result.status === "ready",
              status:
                result.status === "failed"
                  ? "failed"
                  : result.status === "ready"
                    ? "ready"
                    : "processing",
            });
          });
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [media]);

  function updateMedia(id: string, update: Partial<MediaProgress>) {
    setMedia((current) =>
      current.map((item) => (item.id === id ? { ...item, ...update } : item))
    );
  }

  async function addImage() {
    if (!editor || !imageFile) return;
    if (imageFile.size > 20 * 1024 * 1024) {
      toast.error("Wiki images must be 20 MB or smaller.");
      return;
    }
    if (!imageAlt.trim() && imageAlt !== "") return;
    const tempId = crypto.randomUUID();
    setMedia((current) => [
      ...current,
      { id: tempId, label: imageFile.name, percent: 0, status: "uploading" },
    ]);
    setImageOpen(false);
    try {
      const presign = await fetch("/api/wiki/media/image/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId: page.id,
          fileName: imageFile.name,
          contentType: imageFile.type,
          sizeBytes: imageFile.size,
        }),
      });
      const start = await presign.json();
      if (!presign.ok) throw new Error(start.error ?? "Could not start image upload");
      await uploadWithProgress(start.uploadUrl, imageFile, imageFile.type, (percent) =>
        updateMedia(tempId, { percent })
      );
      updateMedia(tempId, { status: "processing", percent: 100 });
      const complete = await fetch("/api/wiki/media/image/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId: start.mediaId }),
      });
      const result = await complete.json();
      if (!complete.ok) throw new Error(result.error ?? "Could not process image");
      editor
        .chain()
        .focus()
        .insertContent({
          type: "wikiImage",
          attrs: {
            mediaId: start.mediaId,
            alt: imageAlt,
            caption: imageCaption,
            width: result.width,
            height: result.height,
          },
        })
        .run();
      updateMedia(tempId, { status: "ready" });
      toast.success("Image added");
      setImageFile(null);
      setImageAlt("");
      setImageCaption("");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Image upload failed";
      updateMedia(tempId, { status: "failed", error: message });
      toast.error(message);
    }
  }

  async function addVideo() {
    if (!editor || !videoFile) return;
    setVideoPreparing(true);
    let inspection: Awaited<ReturnType<typeof inspectWikiVideo>>;
    try {
      inspection = await inspectWikiVideo(videoFile);
    } catch (cause) {
      setVideoPreparing(false);
      toast.error(cause instanceof Error ? cause.message : "This video could not be inspected");
      return;
    }
    setVideoPreparing(false);
    const tempId = crypto.randomUUID();
    setMedia((current) => [
      ...current,
      { id: tempId, label: videoFile.name, percent: 0, status: "uploading" },
    ]);
    setVideoOpen(false);
    try {
      const response = await fetch("/api/wiki/media/video/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId: page.id,
          fileName: videoFile.name,
          contentType: "video/mp4",
          sizeBytes: videoFile.size,
          durationSeconds: inspection.durationSeconds,
          width: inspection.width,
          height: inspection.height,
          posterSizeBytes: inspection.poster.size,
          spokenLanguage: videoLanguage,
        }),
      });
      const upload = await response.json();
      if (!response.ok) throw new Error(upload.error ?? "Could not start video upload");
      const posterUpload = fetch(upload.posterUploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: inspection.poster,
      }).then((result) => {
        if (!result.ok) throw new Error("Video preview upload failed");
      });
      await Promise.all([
        uploadWithProgress(upload.uploadUrl, videoFile, "video/mp4", (percent) =>
          updateMedia(tempId, { percent })
        ),
        posterUpload,
      ]);
      const completeResponse = await fetch("/api/wiki/media/video/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId: upload.mediaId }),
      });
      const completed = await completeResponse.json();
      if (!completeResponse.ok) {
        throw new Error(completed.error ?? "Could not verify video upload");
      }
      updateMedia(tempId, {
        status: "ready",
        percent: 100,
        mediaId: upload.mediaId,
        videoReady: true,
        captionStatus: "not_requested",
      });
      editor
        .chain()
        .focus()
        .insertContent({
          type: "wikiVideo",
          attrs: { mediaId: upload.mediaId, caption: videoCaption },
        })
        .run();
      toast.success("Video stored privately. Captions are optional — add a VTT if it has speech.");
      setVideoFile(null);
      setVideoCaption("");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Video upload failed";
      updateMedia(tempId, { status: "failed", error: message });
      toast.error(message);
    }
  }

  function closeEmbedDialog() {
    setEmbedOpen(false);
    setEditingEmbedPosition(null);
    setEmbedUrl("");
    setEmbedCaption("");
  }

  function openEmbedDialogFromToolbar() {
    if (!editor) return;
    if (editor.isActive("externalEmbed")) {
      openEmbedEditor({
        position: editor.state.selection.from,
        attrs: editor.getAttributes("externalEmbed") as WikiExternalEmbedAttrs,
      });
      return;
    }
    setEditingEmbedPosition(null);
    setEmbedUrl("");
    setEmbedCaption("");
    setEmbedOpen(true);
  }

  function saveEmbed() {
    if (!editor) return;
    const embed = canonicalizeWikiEmbed(embedUrl);
    if (!embed) {
      toast.error("Paste a valid YouTube, Vimeo, or Loom URL.");
      return;
    }
    const attrs = { ...embed, caption: embedCaption };
    if (editingEmbedPosition !== null) {
      const node = editor.state.doc.nodeAt(editingEmbedPosition);
      if (node?.type.name !== "externalEmbed") {
        toast.error("That embed moved. Select it and try again.");
        closeEmbedDialog();
        return;
      }
      editor
        .chain()
        .focus()
        .setNodeSelection(editingEmbedPosition)
        .updateAttributes("externalEmbed", attrs)
        .run();
      toast.success("Embed updated");
    } else {
      editor
        .chain()
        .focus()
        .insertContent({ type: "externalEmbed", attrs })
        .run();
      toast.success("Embed added");
    }
    closeEmbedDialog();
  }

  function addLink() {
    if (!editor) return;
    try {
      const url = new URL(linkUrl);
      if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) throw new Error();
      editor.chain().focus().extendMarkRange("link").setLink({ href: url.toString() }).run();
      setLinkOpen(false);
      setLinkUrl("");
    } catch {
      toast.error("Enter a valid HTTP, HTTPS, or mailto link.");
    }
  }

  async function uploadCaptions(item: MediaProgress, file: File | null) {
    if (!item.mediaId || !file) return;
    const form = new FormData();
    form.set("file", file);
    const response = await fetch(`/api/wiki/media/${item.mediaId}/captions`, {
      method: "PUT",
      body: form,
    });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error ?? "Captions could not be uploaded");
    updateMedia(item.id, { captionStatus: "ready", status: "ready" });
    toast.success("Captions uploaded");
  }

  async function markNoSpeech(item: MediaProgress) {
    if (!item.mediaId) return;
    const result = await markWikiVideoNoSpeech(item.mediaId);
    if (!result.ok) return toast.error(result.error.message);
    updateMedia(item.id, { captionStatus: "not_needed", status: "ready" });
    toast.success("Video marked as having no spoken audio");
  }

  function publish() {
    startPublish(async () => {
      if (!(await save())) return;
      const result = await publishWikiPage(page.id);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Wiki page published");
      router.push(`/wiki/${page.subjectSlug}/${page.slug}`);
      router.refresh();
    });
  }

  function cancelEditing() {
    startClose(async () => {
      if (conflict && dirtyRef.current) {
        if (!(await confirmDialog("Leave the editor? Your unsaved changes in this tab will be lost."))) {
          return;
        }
        dirtyRef.current = false;
        setDirty(false);
      } else if (!(await save())) {
        return;
      }

      router.push(
        page.publishedRevisionId
          ? `/wiki/${page.subjectSlug}/${page.slug}`
          : "/wiki"
      );
    });
  }

  async function moveToTrash() {
    if (!(await confirmDialog(`Move “${title}” to trash? It can be restored for 30 days.`))) return;
    const result = await trashWikiPage(page.id);
    if (!result.ok) return toast.error(result.error.message);
    toast.success("Page moved to trash");
    router.push("/wiki");
    router.refresh();
  }

  if (!editor) {
    return <div className="h-[40rem] animate-pulse rounded-xl bg-muted" />;
  }

  return (
    <div className="space-y-4 pb-16 sm:pb-0">
      {conflict ? (
        <div className="flex flex-col gap-3 rounded-xl border border-warning/45 bg-warning/12 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <MessageSquareWarning className="mt-0.5 size-5 shrink-0 text-warning" />
            <div>
              <p className="font-semibold">A newer draft was saved elsewhere.</p>
              <p className="text-muted-foreground">Your unsaved text remains in this tab. Reload when you are ready to use the latest draft.</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => window.location.reload()}>Reload latest</Button>
        </div>
      ) : null}

      <div className="wiki-editor-paper">
        <div className="space-y-3 border-b px-4 py-5 sm:px-8">
          <Textarea
            value={title}
            onChange={(event) => { setTitle(event.target.value); markDirty(); }}
            aria-label="Page title"
            maxLength={160}
            rows={2}
            className="min-h-0 resize-none border-0 bg-transparent px-0 font-heading text-3xl font-semibold leading-tight tracking-tight shadow-none focus-visible:ring-0 md:text-3xl"
          />
          <Textarea
            value={summary}
            onChange={(event) => { setSummary(event.target.value); markDirty(); }}
            aria-label="Page summary"
            placeholder="A short description that helps teammates know when to use this tutorial."
            maxLength={500}
            rows={2}
            className="resize-none border-0 bg-transparent px-0 text-base text-muted-foreground shadow-none focus-visible:ring-0 md:text-base"
          />
        </div>

        <div data-wiki-toolbar className="sticky top-0 z-20 flex flex-wrap items-center gap-1 border-b bg-card/95 p-2 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <ToolbarButton label="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}><Undo2 /></ToolbarButton>
          <ToolbarButton label="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}><Redo2 /></ToolbarButton>
          <span className="mx-1 h-6 w-px bg-border" />
          <ToolbarButton label="Paragraph" active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()}><Pilcrow /></ToolbarButton>
          <ToolbarButton label="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 /></ToolbarButton>
          <ToolbarButton label="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 /></ToolbarButton>
          <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold /></ToolbarButton>
          <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic /></ToolbarButton>
          <ToolbarButton label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough /></ToolbarButton>
          <ToolbarButton label="Bulleted list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List /></ToolbarButton>
          <ToolbarButton label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered /></ToolbarButton>
          <ToolbarButton label="Checklist" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}><CheckSquare2 /></ToolbarButton>
          <ToolbarButton label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote /></ToolbarButton>
          <ToolbarButton label="Code block" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code2 /></ToolbarButton>
          <ToolbarButton label="Note callout" onClick={() => editor.chain().focus().insertContent({ type: "callout", attrs: { kind: "note" }, content: [{ type: "paragraph", content: [{ type: "text", text: "Important context" }] }] }).run()}><Lightbulb /></ToolbarButton>
          <span className="mx-1 h-6 w-px bg-border" />
          <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
            <DialogTrigger render={<Button variant="ghost" size="icon-sm" className="pointer-coarse:size-11" aria-label="Add link" title="Add link" />}><Link2 /></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add a link</DialogTitle><DialogDescription>Select words in the editor, then enter the destination. External links open in a new tab for readers.</DialogDescription></DialogHeader>
              <div className="grid gap-2"><Label htmlFor="wiki-link-url">Destination URL</Label><Input id="wiki-link-url" type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://…" /></div>
              <DialogFooter><Button variant="outline" onClick={() => setLinkOpen(false)}>Cancel</Button><Button disabled={!linkUrl.trim()} onClick={addLink}>Add link</Button></DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={imageOpen} onOpenChange={setImageOpen}>
            <DialogTrigger render={<Button variant="ghost" size="icon-sm" className="pointer-coarse:size-11" aria-label="Add image" title="Add image" />}><ImagePlus /></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add an image</DialogTitle><DialogDescription>JPEG, PNG, or WebP up to 20 MB. Sastra removes metadata and compresses it before storage.</DialogDescription></DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-2"><Label htmlFor="wiki-image-file">Image</Label><Input id="wiki-image-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} /></div>
                <div className="grid gap-2"><Label htmlFor="wiki-image-alt">Alt text</Label><Input id="wiki-image-alt" value={imageAlt} onChange={(e) => setImageAlt(e.target.value)} placeholder="Describe the information in the image, or leave empty if decorative" /></div>
                <div className="grid gap-2"><Label htmlFor="wiki-image-caption">Caption</Label><Input id="wiki-image-caption" value={imageCaption} onChange={(e) => setImageCaption(e.target.value)} /></div>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setImageOpen(false)}>Keep editing</Button><Button disabled={!imageFile} onClick={() => void addImage()}>Upload image</Button></DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={videoOpen} onOpenChange={setVideoOpen}>
            <DialogTrigger render={<Button variant="ghost" size="icon-sm" className="pointer-coarse:size-11" aria-label="Upload private video" title="Upload private video" />}><FileVideo /></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Upload a private video</DialogTitle><DialogDescription>Compressed MP4 only, up to 30 minutes, 500 MB, 4K, and an average of 8 Mbps. Sastra checks compatibility and creates a first-frame preview before uploading privately to R2.</DialogDescription></DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-2"><Label htmlFor="wiki-video-file">MP4 video</Label><Input id="wiki-video-file" type="file" accept="video/mp4,.mp4" onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)} /></div>
                <div className="grid gap-2"><Label htmlFor="wiki-video-language">Spoken language</Label><Input id="wiki-video-language" value={videoLanguage} onChange={(e) => setVideoLanguage(e.target.value)} placeholder="BCP 47 code, for example en or fr" /></div>
                <div className="grid gap-2"><Label htmlFor="wiki-video-caption">Caption</Label><Input id="wiki-video-caption" value={videoCaption} onChange={(e) => setVideoCaption(e.target.value)} /></div>
              </div>
              <DialogFooter><Button variant="outline" disabled={videoPreparing} onClick={() => setVideoOpen(false)}>Keep editing</Button><Button disabled={!videoFile || !videoLanguage.trim() || videoPreparing} onClick={() => void addVideo()}>{videoPreparing ? <><Loader2 className="animate-spin" />Checking video…</> : "Upload video"}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={embedOpen} onOpenChange={(open) => { if (!open) closeEmbedDialog(); }}>
            <Button type="button" variant="ghost" size="icon-sm" className="pointer-coarse:size-11" aria-label="Embed YouTube, Vimeo, or Loom" title="Embed YouTube, Vimeo, or Loom" onClick={openEmbedDialogFromToolbar}><SquarePlay /></Button>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingEmbedPosition === null ? "Embed a tutorial" : "Edit tutorial embed"}</DialogTitle><DialogDescription>{editingEmbedPosition === null ? "Paste a YouTube, Vimeo, or Loom URL. Other websites should be added as ordinary links." : "Replace the video URL or update the caption. The draft saves automatically after you apply the change."}</DialogDescription></DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-2"><Label htmlFor="wiki-embed-url">Video URL</Label><Input id="wiki-embed-url" type="url" value={embedUrl} onChange={(e) => setEmbedUrl(e.target.value)} /></div>
                <div className="grid gap-2"><Label htmlFor="wiki-embed-caption">Caption</Label><Input id="wiki-embed-caption" value={embedCaption} onChange={(e) => setEmbedCaption(e.target.value)} /></div>
              </div>
              <DialogFooter><Button variant="outline" onClick={closeEmbedDialog}>Keep editing</Button><Button disabled={!embedUrl.trim()} onClick={saveEmbed}>{editingEmbedPosition === null ? "Add embed" : "Save changes"}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {media.length > 0 ? (
          <div className="grid gap-2 border-b bg-muted/25 px-4 py-3 sm:px-8">
            {media.map((item) => (
              <div key={item.id} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                {item.status === "ready" ? <Check className="size-4 text-success" /> : item.status === "failed" ? <AlertTriangle className="size-4 text-destructive" /> : <Loader2 className="size-4 animate-spin text-primary" />}
                <span className="min-w-32 flex-1 truncate">{item.label}</span>
                <span className="max-w-[min(40vw,24rem)] truncate text-xs tabular-nums text-muted-foreground" title={item.error}>{item.status === "processing" ? item.videoReady ? "Finishing up…" : "Verifying private upload…" : item.status === "failed" ? item.error ?? "Failed" : item.status === "ready" ? "Ready" : `${item.percent}%`}</span>
                {item.mediaId && item.videoReady ? (
                  item.captionStatus === "ready" ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Captions className="size-3.5" /> Captions added</span>
                  ) : item.captionStatus === "not_needed" ? null : (
                    <div className="ml-7 flex w-full flex-wrap items-center gap-1 sm:ml-0 sm:w-auto sm:shrink-0">
                      <span className="text-xs text-muted-foreground">Captions optional</span>
                      <Button nativeButton={false} render={<label htmlFor={`captions-${item.id}`} />} variant="ghost" size="xs"><Captions /> Add VTT</Button>
                      <input id={`captions-${item.id}`} type="file" accept="text/vtt,.vtt" className="sr-only" onChange={(event) => void uploadCaptions(item, event.target.files?.[0] ?? null)} />
                      <Button variant="ghost" size="xs" onClick={() => void markNoSpeech(item)}><VolumeX /> No speech</Button>
                    </div>
                  )
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <EditorContent editor={editor} />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          {saving ? <><Loader2 className="size-4 animate-spin" /> Saving your draft…</> : dirty ? "Waiting to save…" : savedAt ? `Draft saved ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : `Draft version ${version}`}
        </div>
        <div className="flex flex-wrap gap-2">
          <WikiRevisionHistory pageId={page.id} revisions={revisions} />
          <Button
            variant="outline"
            disabled={closing || publishing || saving}
            title="Leave the editor; saved draft changes are kept"
            onClick={cancelEditing}
          >
            {closing ? <Loader2 className="animate-spin" /> : <X />}
            {closing ? "Closing…" : "Cancel"}
          </Button>
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void moveToTrash()}><Trash2 />Move to trash</Button>
          <Button disabled={publishing || saving || conflict} onClick={publish}>{publishing ? <Loader2 className="animate-spin" /> : <Send />}Publish</Button>
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactElement<{ className?: string }>;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon-sm"
      className="pointer-coarse:size-11"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

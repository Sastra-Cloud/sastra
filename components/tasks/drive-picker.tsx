"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ExternalLink,
  Folder,
  Loader2,
  Paperclip,
  Plus,
  Upload,
  X,
} from "lucide-react";

import { authClient } from "@/lib/auth/client";
import {
  addTaskDriveFile,
  getDriveAttachContext,
  getDriveOAuthToken,
  type DriveAttachContext,
} from "@/lib/tasks/drive-actions";
import {
  mergeTaskDriveFileSelections,
  resolveTaskDriveUploadFolderId,
  type TaskDriveFileSelection,
} from "@/lib/tasks/drive-file-selection";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import {
  loadGooglePicker,
  prepareGooglePicker,
  showGooglePicker,
} from "@/lib/tasks/google-picker-client";

/* eslint-disable @typescript-eslint/no-explicit-any */
const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Best deep-link for a picked Drive item (folders and files differ). */
function driveItemUrl(
  id: string,
  mimeType?: string | null,
  url?: string | null
): string {
  if (url) return url;
  return mimeType === FOLDER_MIME
    ? `https://drive.google.com/drive/folders/${id}`
    : `https://drive.google.com/file/d/${id}/view`;
}

function pickerBuilder(g: any, ctx: DriveAttachContext, token: string) {
  const builder = new g.picker.PickerBuilder()
    .setDeveloperKey(ctx.apiKey)
    .setOAuthToken(token)
    .setOrigin(window.location.origin);
  if (ctx.appId) builder.setAppId(ctx.appId);
  return builder;
}

function showDriveOpenError(error: unknown) {
  console.error("Google Picker could not open", error);
  toast.error("Couldn't open Google Drive. Check your internet and try again.");
}

/**
 * Shared Drive connection state + a helper that opens a picker built by the
 * caller. Handles the server token refresh and the "reconnect" fallback so each
 * button doesn't repeat it.
 */
function useDrive(activeInForm = true) {
  const [ctx, setCtx] = useState<DriveAttachContext | null>(null);
  const active = useRef<AbortController | null>(null);

  useEffect(() => () => active.current?.abort(), []);

  useEffect(() => {
    // The create-task form stays mounted after closing to preserve its draft.
    if (!activeInForm) active.current?.abort();
  }, [activeInForm]);

  useEffect(() => {
    if (ctx?.configured && ctx.connected) {
      // Start the shared SDK load while the user fills in the task form.
      void loadGooglePicker().catch(() => {});
    }
  }, [ctx?.configured, ctx?.connected]);

  useEffect(() => {
    getDriveAttachContext()
      .then(setCtx)
      .catch(() => setCtx(null));
  }, []);

  const connect = useCallback(() => {
    authClient.linkSocial({
      provider: "google",
      scopes: ["https://www.googleapis.com/auth/drive.file"],
      callbackURL: window.location.href,
    });
  }, []);

  /** Keep opening feedback visible until the iframe loads or opening fails. */
  const open = useCallback(async (
    build: (g: any, token: string) => any,
    onPicked: (data: any) => void | Promise<void>
  ) => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const loadingToast = toast.loading("Opening Google Drive…", {
      action: { label: "Cancel", onClick: () => controller.abort() },
    });
    try {
      const token = await prepareGooglePicker(getDriveOAuthToken, controller.signal);
      if (controller.signal.aborted) return;
      if (!token) {
        toast.error("Reconnect your Google account to use Drive.");
        setCtx((c) => (c ? { ...c, connected: false } : c));
        return;
      }
      await showGooglePicker(build(window.google, token), {
        signal: controller.signal,
        onPicked,
        onError: showDriveOpenError,
      });
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    } finally {
      toast.dismiss(loadingToast);
    }
  }, []);

  return { ctx, connect, open };
}

/** Loading → null; not configured → note; not connected → Connect button. */
function DriveGate({
  ctx,
  connect,
}: {
  ctx: DriveAttachContext | null;
  connect: () => void;
}) {
  if (!ctx) return null;
  if (!ctx.configured) {
    return (
      <p className="text-xs text-muted-foreground">
        Google Drive is not set up for this workspace.
      </p>
    );
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={connect}>
      Connect Google Drive
    </Button>
  );
}

/** Connect Google / open the Drive Picker (shared drive) to attach files or folders to a task. */
export function DriveAttachButton({
  taskId,
  onChange,
}: {
  taskId: string;
  onChange: () => void;
}) {
  const { ctx, connect, open } = useDrive();
  const [busy, setBusy] = useState(false);

  const openPicker = useCallback(async () => {
    if (!ctx?.apiKey || !ctx.sharedDriveId) return;
    setBusy(true);
    try {
      await open((g, token) => {
        const view = new g.picker.DocsView(g.picker.ViewId.DOCS)
          .setEnableDrives(true)
          .setParent(ctx.sharedDriveId)
          .setIncludeFolders(true)
          .setSelectFolderEnabled(true);
        const uploadView = new g.picker.DocsUploadView().setParent(
          ctx.sharedDriveId
        );
        return pickerBuilder(g, ctx, token)
          .enableFeature(g.picker.Feature.MULTISELECT_ENABLED)
          .addView(view)
          .addView(uploadView);
      }, async (data: any) => {
        const docs: any[] = data.docs ?? [];
        try {
          for (const d of docs) {
            await addTaskDriveFile(taskId, {
              driveFileId: d.id,
              name: d.name ?? "Drive item",
              mimeType: d.mimeType ?? null,
              iconUrl: d.iconUrl ?? null,
              url: driveItemUrl(d.id, d.mimeType, d.url),
            });
          }
          toast.success(docs.length > 1 ? "Items attached" : "Attached");
          onChange();
        } catch {
          toast.error("Couldn't attach.");
        }
      });
    } catch (error) {
      showDriveOpenError(error);
    } finally {
      setBusy(false);
    }
  }, [ctx, taskId, onChange, open]);

  if (!ctx || !ctx.configured || !ctx.connected) {
    return <DriveGate ctx={ctx} connect={connect} />;
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={openPicker}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Plus className="size-4" />
      )}
      Attach from Drive
    </Button>
  );
}

/**
 * Pick a single Drive FOLDER (browses all shared drives the user can access).
 * `startInFolderId` opens the picker inside a given folder (e.g. the project's
 * main folder) so sub-folders are easy to reach.
 */
export function DriveFolderPickerButton({
  active = true,
  startInFolderId,
  label = "Link Drive folder",
  quiet = false,
  onPicked,
}: {
  active?: boolean;
  startInFolderId?: string | null;
  label?: string;
  /** Render nothing (instead of a gate message) when Drive isn't ready. */
  quiet?: boolean;
  onPicked: (folder: {
    folderId: string;
    name: string;
    url: string;
  }) => void | Promise<void>;
}) {
  const { ctx, connect, open } = useDrive(active);
  const [busy, setBusy] = useState(false);

  const openPicker = useCallback(async () => {
    if (!ctx?.apiKey) return;
    setBusy(true);
    try {
      await open((g, token) => {
        const view = new g.picker.DocsView(g.picker.ViewId.FOLDERS)
          .setEnableDrives(true)
          .setSelectFolderEnabled(true)
          .setMimeTypes(FOLDER_MIME);
        if (startInFolderId) view.setParent(startInFolderId);
        return pickerBuilder(g, ctx, token)
          .addView(view);
      }, async (data: any) => {
        const d = (data.docs ?? [])[0];
        if (!d) return;
        try {
          await onPicked({
            folderId: d.id,
            name: d.name ?? "Drive folder",
            url: driveItemUrl(d.id, FOLDER_MIME, d.url),
          });
        } catch {
          toast.error("Couldn't save the folder.");
        }
      });
    } catch (error) {
      showDriveOpenError(error);
    } finally {
      setBusy(false);
    }
  }, [ctx, startInFolderId, onPicked, open]);

  if (!ctx || !ctx.configured || !ctx.connected) {
    if (quiet) return null;
    return <DriveGate ctx={ctx} connect={connect} />;
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={openPicker}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Folder className="size-4" />
      )}
      {label}
    </Button>
  );
}

/**
 * Controlled folder field for the create-task form: renders hidden state via
 * `value`/`onChange`, stays silent when Drive isn't configured, and starts the
 * picker inside the project's main folder so sub-folders are one click away.
 */
export function TaskDriveFolderPicker({
  active = true,
  value,
  onChange,
  startInFolderId,
  label,
  hint,
}: {
  active?: boolean;
  value: { folderId: string; name: string; url: string } | null;
  onChange: (
    folder: { folderId: string; name: string; url: string } | null
  ) => void;
  startInFolderId?: string | null;
  label?: string;
  hint?: string;
}) {
  const { ctx, connect } = useDrive();

  if (!ctx || !ctx.configured) return null; // stay quiet unless Drive is set up

  let control: ReactNode;
  if (!ctx.connected) {
    control = (
      <Button type="button" variant="outline" size="sm" onClick={connect}>
        Connect Google Drive
      </Button>
    );
  } else if (value) {
    control = (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-sm">
          <Folder className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">{value.name}</span>
        </span>
        <DriveFolderPickerButton
          active={active}
          label="Change"
          startInFolderId={startInFolderId}
          onPicked={onChange}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(null)}
        >
          Clear
        </Button>
      </div>
    );
  } else {
    control = (
      <DriveFolderPickerButton
        active={active}
        label="Choose Drive folder"
        startInFolderId={startInFolderId}
        onPicked={onChange}
      />
    );
  }

  if (!label && !hint) return control;
  return (
    <div className="grid gap-2">
      {label ? <Label>{label}</Label> : null}
      {control}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Controlled attachment queue for a task that has not been created yet.
 * Picker uploads happen in Google immediately; the selected Drive references
 * are saved with the task when its create action succeeds.
 */
export function TaskDriveFilesPicker({
  active = true,
  value,
  onChange,
  defaultFolderId,
}: {
  active?: boolean;
  value: TaskDriveFileSelection[];
  onChange: (files: TaskDriveFileSelection[]) => void;
  defaultFolderId?: string | null;
}) {
  const { ctx, connect, open } = useDrive(active);
  const [busy, setBusy] = useState(false);

  const openPicker = useCallback(async () => {
    if (!ctx?.apiKey || !ctx.sharedDriveId) return;
    setBusy(true);
    try {
      await open((g, token) => {
        const destination = defaultFolderId ?? ctx.sharedDriveId;
        const view = new g.picker.DocsView(g.picker.ViewId.DOCS)
          .setEnableDrives(true)
          .setParent(destination)
          .setIncludeFolders(false);
        if (g.picker.DocsViewMode?.LIST) {
          view.setMode(g.picker.DocsViewMode.LIST);
        }
        const uploadView = new g.picker.DocsUploadView().setParent(destination);
        return pickerBuilder(g, ctx, token)
          .enableFeature(g.picker.Feature.MULTISELECT_ENABLED)
          .addView(view)
          .addView(uploadView);
      }, (data: any) => {
        const selected = (data.docs ?? []).map((item: any) => ({
          driveFileId: String(item.id),
          name: String(item.name ?? "Drive file"),
          mimeType: item.mimeType ? String(item.mimeType) : null,
          iconUrl: item.iconUrl ? String(item.iconUrl) : null,
          url: driveItemUrl(item.id, item.mimeType, item.url),
        }));
        onChange(mergeTaskDriveFileSelections(value, selected));
        toast.success(
          selected.length > 1
            ? `${selected.length} files ready to attach`
            : "File ready to attach"
        );
      });
    } catch (error) {
      showDriveOpenError(error);
    } finally {
      setBusy(false);
    }
  }, [ctx, defaultFolderId, onChange, open, value]);

  if (!ctx || !ctx.configured) return null;

  return (
    <div className="grid gap-2">
      <Label>Attachments (optional)</Label>
      {value.length > 0 ? (
        <ul className="space-y-1.5">
          {value.map((file) => (
            <li
              key={file.driveFileId}
              className="flex items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-2"
            >
              {file.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={file.iconUrl} alt="" className="size-4 shrink-0" />
              ) : (
                <Paperclip className="size-4 shrink-0 text-muted-foreground" />
              )}
              <a
                href={file.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-sm hover:underline"
              >
                {file.name}
              </a>
              <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${file.name}`}
                onClick={() =>
                  onChange(
                    value.filter(
                      (item) => item.driveFileId !== file.driveFileId
                    )
                  )
                }
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {ctx.connected ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={busy}
          onClick={openPicker}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Paperclip className="size-4" />
          )}
          {busy ? "Opening Google Drive…" : "Add or upload files"}
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={connect}
        >
          Connect Google Drive
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Uploads are placed in Google Drive immediately and linked when you
        create the task.
      </p>
    </div>
  );
}

/**
 * Upload a local file into a task's Drive folder. Uses the Picker's own upload
 * view (`DocsUploadView`) targeting the task folder, project folder, or shared
 * drive root (in that order). It runs in the user's Drive session, so it can
 * write into folders they can access, then the created file is auto-attached
 * to the task.
 */
export function DriveUploadButton({
  taskId,
  defaultFolderId,
  defaultFolderName,
  projectFolderId,
  quiet = false,
  onChange,
}: {
  taskId: string;
  defaultFolderId: string | null;
  defaultFolderName: string | null;
  projectFolderId: string | null;
  /** Render nothing (instead of a gate message) when Drive isn't ready. */
  quiet?: boolean;
  onChange: () => void;
}) {
  const { ctx, connect, open } = useDrive();
  const [busy, setBusy] = useState(false);

  const uploadInto = useCallback(
    async (folderId: string) => {
      if (!ctx?.apiKey) return;
      setBusy(true);
      try {
        await open((g, token) => {
          const uploadView = new g.picker.DocsUploadView().setParent(folderId);
          return pickerBuilder(g, ctx, token).addView(uploadView);
        }, async (data: any) => {
          const docs: any[] = data.docs ?? [];
          try {
            for (const d of docs) {
              await addTaskDriveFile(taskId, {
                driveFileId: d.id,
                name: d.name ?? "Uploaded file",
                mimeType: d.mimeType ?? null,
                iconUrl: d.iconUrl ?? null,
                url: driveItemUrl(d.id, d.mimeType, d.url),
              });
            }
            toast.success("Uploaded to Drive");
            onChange();
          } catch {
            toast.error("Uploaded, but couldn't link it to the task.");
          }
        });
      } catch (error) {
        showDriveOpenError(error);
      } finally {
        setBusy(false);
      }
    },
    [ctx, taskId, onChange, open]
  );

  if (!ctx || !ctx.configured || !ctx.connected) {
    if (quiet) return null;
    return <DriveGate ctx={ctx} connect={connect} />;
  }

  // `configured` guarantees a shared drive id, which gives every upload a
  // direct destination even before a task/project working folder is chosen.
  const uploadFolderId = resolveTaskDriveUploadFolderId(
    defaultFolderId,
    projectFolderId,
    ctx.sharedDriveId
  );
  if (!uploadFolderId) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        title={`Upload to ${defaultFolderName ?? "the shared drive"}`}
        onClick={() => uploadInto(uploadFolderId)}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Upload className="size-4" />
        )}
        Upload to Drive
      </Button>
      <DriveFolderPickerButton
        label="Choose another folder…"
        startInFolderId={projectFolderId ?? ctx.sharedDriveId}
        onPicked={({ folderId }) => uploadInto(folderId)}
      />
    </div>
  );
}

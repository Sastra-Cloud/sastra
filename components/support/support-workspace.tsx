"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supportRouteSummary } from "@/lib/support/config";

type Ticket = {
  id: string;
  subject: string;
  body: string;
  status: string;
  category: string;
  feature_status: string | null;
  email_muted: number;
};
type Thread = {
  ticket: Ticket;
  messages: { id: string; author: string; body: string; created_at: string }[];
  attachments: { id: string; name: string }[];
};
async function call(input: Record<string, unknown>) {
  const r = await fetch("/api/support", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const x = await r.json();
  if (!r.ok) throw new Error(x.error ?? "Please retry.");
  return x;
}

export function SupportWorkspace({
  connected,
  version,
}: {
  connected: boolean;
  version: { version: string; revision: string | null };
}) {
  const params = useSearchParams(),
    [tickets, setTickets] = useState<Ticket[]>([]),
    [thread, setThread] = useState<Thread | null>(null),
    [category, setCategory] = useState("support"),
    [subject, setSubject] = useState(""),
    [body, setBody] = useState(""),
    [reply, setReply] = useState(""),
    [humanOnly, setHumanOnly] = useState(false),
    [pending, setPending] = useState<string | null>(
      connected ? "Loading requests…" : null,
    ),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [files, setFiles] = useState<File[]>([]),
    [copied, setCopied] = useState(false),
    [preferencePending, setPreferencePending] = useState(false);
  const requestKey = useRef(""),
    replyKey = useRef(""),
    busy = useRef(false),
    fileInput = useRef<HTMLInputElement>(null);
  const [createdId, setCreatedId] = useState<string | null>(null),
    [browser, setBrowser] = useState("");
  useEffect(() => {
    queueMicrotask(() => setBrowser(navigator.userAgent.slice(0, 300)));
    requestKey.current = crypto.randomUUID();
    replyKey.current = crypto.randomUUID();
  }, []);
  const route = supportRouteSummary(params.get("from") ?? "/support");
  const load = useCallback(async () => {
    setTickets((await call({ op: "list" })).tickets);
  }, []);
  const open = useCallback(async (id: string) => {
    setThread(await call({ op: "get", ticketId: id }));
    setReply("");
    replyKey.current = crypto.randomUUID();
  }, []);
  useEffect(() => {
    if (!connected) return;
    let active = true;
    Promise.resolve()
      .then(load)
      .then(() =>
        params.get("ticket") ? open(params.get("ticket")!) : undefined,
      )
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setPending(null);
      });
    return () => {
      active = false;
    };
  }, [connected, load, open, params]);
  async function run(label: string, fn: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setPending(label);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Please retry. Your text is still here.",
      );
    } finally {
      busy.current = false;
      setPending(null);
    }
  }
  async function submit() {
    await run("Submitting request…", async () => {
      let id = createdId;
      if (!id) {
        const x = await call({
          op: "create",
          requestKey: requestKey.current,
          category,
          subject,
          body,
          humanOnly,
          diagnostics: { route, browser },
        });
        id = x.ticket.id;
        setCreatedId(id);
      }
      for (let n = 0; n < files.length; n++) {
        setPending(`Uploading attachment ${n + 1} of ${files.length}…`);
        const file = files[n]!;
        const data = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result).split(",")[1]!);
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        await call({ op: "upload", ticketId: id, name: file.name, data });
      }
      await load();
      await open(id!);
      setSubject("");
      setBody("");
      setFiles([]);
      setCreatedId(null);
      if (fileInput.current) fileInput.current.value = "";
      requestKey.current = crypto.randomUUID();
      setNotice("Your request was received.");
    });
  }
  async function download(id: string) {
    await run("Downloading attachment…", async () => {
      const x = await call({
        op: "download",
        ticketId: thread!.ticket.id,
        attachmentId: id,
      });
      const bytes = Uint8Array.from(atob(x.data), (c) => c.charCodeAt(0)),
        url = URL.createObjectURL(new Blob([bytes], { type: x.type }));
      const a = document.createElement("a");
      a.href = url;
      a.download = x.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    });
  }
  const diagnostics = JSON.stringify({ ...version, route, browser }, null, 2);
  if (!connected)
    return (
      <div className="space-y-6">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Community help</h2>
          <p className="text-sm text-muted-foreground">
            Self-hosted installations use community support. Start with the Help
            guide, ask a question in Discussions, or report a bug or feature
            request on GitHub.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              render={
                <a
                  href="https://github.com/Sastra-Cloud/sastra/discussions"
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              Ask the community
            </Button>
            <Button
              variant="outline"
              render={
                <a
                  href="https://github.com/Sastra-Cloud/sastra/issues/new/choose"
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              Report a bug or request a feature
            </Button>
          </div>
        </section>
        <section className="space-y-3">
          <h2 className="font-semibold">Diagnostic summary</h2>
          <pre className="overflow-auto rounded-md border bg-muted/30 p-4 text-xs">
            {diagnostics}
          </pre>
          <Button
            variant="outline"
            onClick={() =>
              void navigator.clipboard.writeText(diagnostics).then(
                () => setCopied(true),
                () => setError("Select and copy the summary above."),
              )
            }
          >
            {copied ? "Copied" : "Copy summary"}
          </Button>
          {error && <p role="alert">{error}</p>}
        </section>
      </div>
    );
  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Private priority support. We do not promise a response time or feature
        delivery date. Your requests are visible to workspace admins and the
        cloud account owner.
      </p>
      {pending && (
        <p role="status" className="text-sm font-medium">
          {pending}
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
        >
          {error} Your text is preserved.{" "}
          <button
            className="underline"
            onClick={() => void run("Loading requests…", load)}
          >
            Reload requests
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">My requests</h2>
        {tickets.length ? (
          <ul className="divide-y rounded-md border">
            {tickets.map((t) => (
              <li key={t.id}>
                <button
                  className="flex min-h-12 w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted/40"
                  onClick={() => void run("Opening request…", () => open(t.id))}
                >
                  <span className="font-medium">{t.subject}</span>
                  <span className="text-xs text-muted-foreground">
                    {t.status.replaceAll("_", " ")}
                    {t.feature_status
                      ? ` · ${t.feature_status.replaceAll("_", " ")}`
                      : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No requests yet. Use the form below when you need help.
          </p>
        )}
      </section>
      {thread && (
        <section className="space-y-4 rounded-lg border p-4 sm:p-6">
          <h2 className="text-lg font-semibold">{thread.ticket.subject}</h2>
          <p className="whitespace-pre-wrap text-sm">{thread.ticket.body}</p>
          {thread.messages.map((m) => (
            <div key={m.id} className="border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground">
                {m.author === "operator" ? "Sastra support" : "Customer"} ·{" "}
                {new Date(m.created_at).toLocaleString()}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{m.body}</p>
            </div>
          ))}
          {thread.attachments.map((a) => (
            <button
              key={a.id}
              className="block text-sm underline"
              onClick={() => void download(a.id)}
            >
              {a.name}
            </button>
          ))}
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run("Sending reply…", async () => {
                await call({
                  op: "reply",
                  ticketId: thread.ticket.id,
                  requestKey: replyKey.current,
                  body: reply,
                });
                await open(thread.ticket.id);
                await load();
                setNotice("Your reply was received.");
              });
            }}
          >
            <Label htmlFor="support-reply">Your reply</Label>
            <Textarea
              id="support-reply"
              required
              maxLength={12000}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
            <Button type="submit" disabled={!!pending}>
              Send reply
            </Button>
          </form>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!thread.ticket.email_muted}
              disabled={preferencePending}
              onChange={(e) => {
                setPreferencePending(true);
                const muted = e.target.checked;
                const old = thread;
                setThread({
                  ...thread,
                  ticket: { ...thread.ticket, email_muted: muted ? 1 : 0 },
                });
                void call({
                  op: "preferences",
                  ticketId: thread.ticket.id,
                  emailMuted: muted,
                })
                  .catch((e) => {
                    setThread(old);
                    setError(e.message);
                  })
                  .finally(() => setPreferencePending(false));
              }}
            />
            Mute email replies
          </label>
        </section>
      )}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">New request</h2>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="support-category">What do you need?</Label>
            <select
              id="support-category"
              className="h-11 w-full rounded-md border bg-background px-3 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={!!createdId}
            >
              <option value="support">Contact support</option>
              <option value="bug">Report a problem</option>
              <option value="feature">Request a feature</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="support-subject">Subject</Label>
            <Input
              id="support-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              minLength={4}
              maxLength={200}
              required
              disabled={!!createdId}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="support-body">
              What happened, or what would help?
            </Label>
            <Textarea
              id="support-body"
              className="min-h-36"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              minLength={10}
              maxLength={12000}
              required
              disabled={!!createdId}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="support-files">Attachments (optional)</Label>
            <input
              ref={fileInput}
              id="support-files"
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="block w-full text-sm"
              onChange={(e) => {
                const selected = Array.from(e.target.files ?? []);
                if (
                  selected.length > 10 ||
                  selected.some((f) => f.size > 5 * 1024 * 1024)
                ) {
                  setError(
                    "Select up to ten attachments, each no larger than 5 MB.",
                  );
                  e.target.value = "";
                  setFiles([]);
                } else setFiles(selected);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Only files you select are uploaded. Remove private or financial
              details first.
            </p>
          </div>
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Diagnostics included with your request
            </summary>
            <pre className="mt-3 overflow-auto text-xs">{diagnostics}</pre>
          </details>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={humanOnly}
              disabled={!!createdId}
              onChange={(e) => setHumanOnly(e.target.checked)}
            />
            Have a person handle this without AI triage
          </label>
          <p className="text-xs text-muted-foreground">
            Support may use AI to classify your request and draft an answer. A
            person reviews replies and engineering work.
          </p>
          {createdId && (
            <p role="status" className="text-sm">
              Your request is saved. Submit again to finish uploading the
              selected attachments.
            </p>
          )}
          <Button type="submit" disabled={!!pending}>
            {pending?.startsWith("Submitting") ||
            pending?.startsWith("Uploading")
              ? "Submitting…"
              : createdId
                ? "Retry attachments"
                : "Submit request"}
          </Button>
        </form>
      </section>
    </div>
  );
}

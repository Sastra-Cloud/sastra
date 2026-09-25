"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import { getThreadForModal } from "@/lib/email/actions";
import type { ThreadMessage } from "@/lib/email/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ThreadMessageList } from "@/components/correspondence/thread-message-list";

export type PrintThread = {
  id: string;
  threadId: string;
  subject: string | null;
  status: string;
  lastMessageAt: string | null;
  lastDirection: "inbound" | "outbound" | null;
  contactName: string | null;
  latestProofUrl: string | null;
};

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "open") return "secondary";
  return "outline";
}

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString() : "";
}

/**
 * Printer threads for a project. Opening a thread shows it in a modal on the
 * print page instead of navigating away; a link into the full inbox thread is
 * kept for replies and triage. Manager-gated by the caller (rendered only when
 * `canEdit`), and the fetch is manager-gated server-side too.
 */
export function PrintCorrespondenceCard({ threads }: { threads: PrintThread[] }) {
  const [active, setActive] = useState<PrintThread | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function open(thread: PrintThread) {
    setActive(thread);
    setMessages(null);
    setLoading(true);
    try {
      const data = await getThreadForModal(thread.threadId);
      if (!data) {
        toast.error("Couldn’t load this thread.");
        setActive(null);
        return;
      }
      setMessages(data.messages);
    } catch {
      toast.error("Couldn’t load this thread.");
      setActive(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-4" />
            Print correspondence
          </CardTitle>
        </CardHeader>
        <CardContent>
          {threads.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No printer threads linked yet. Emails from saved printer contacts
              will appear here after capture.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {threads.map((thread) => (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => open(thread)}
                    className="block w-full px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {thread.subject ?? "(no subject)"}
                      </span>
                      <Badge variant={statusVariant(thread.status)}>
                        {thread.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {thread.contactName ?? "Printer"}
                      {thread.lastMessageAt
                        ? ` · ${fmtDate(thread.lastMessageAt)}`
                        : ""}
                    </p>
                    {thread.latestProofUrl ? (
                      <p className="mt-1 truncate text-xs text-primary">
                        {thread.latestProofUrl}
                      </p>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!active}
        onOpenChange={(o) => {
          if (!o) {
            setActive(null);
            setMessages(null);
          }
        }}
      >
        <DialogContent className="grid max-h-[calc(100dvh-2rem)] grid-rows-[auto_1fr] gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="space-y-1.5 border-b bg-muted/30 px-5 py-4 text-left">
            <DialogTitle className="pr-8 text-base leading-snug">
              {active?.subject ?? "(no subject)"}
            </DialogTitle>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{active?.contactName ?? "Printer"}</span>
              {active?.status ? (
                <Badge variant={statusVariant(active.status)}>
                  {active.status}
                </Badge>
              ) : null}
              {active ? (
                <Link
                  href={`/correspondence/${active.threadId}`}
                  className="inline-flex items-center gap-1 underline-offset-4 hover:text-foreground hover:underline"
                >
                  Open full thread <ArrowUpRight className="size-3" />
                </Link>
              ) : null}
            </div>
          </DialogHeader>
          <div className="overflow-y-auto px-5 py-4">
            {loading || messages === null || !active ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading messages…
              </div>
            ) : (
              <ThreadMessageList
                messages={messages}
                threadId={active.threadId}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

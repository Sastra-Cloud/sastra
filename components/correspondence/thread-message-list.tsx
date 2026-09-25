import Link from "next/link";
import {
  ChevronDown,
  Download,
  FileText,
  Forward,
  MessageSquareReply,
  Paperclip,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { MessageReprocessButton } from "@/components/correspondence/message-reprocess-button";
import { formatBytes, timeAgo } from "@/lib/format";
import type { ThreadMessage } from "@/lib/email/queries";
import { segmentEmailBody } from "@/lib/email/body-segments";

/**
 * Read-only list of a correspondence thread's messages. Shared by the full
 * thread page and the print-page correspondence modal so both render identically.
 */
export function ThreadMessageList({
  messages,
  threadId,
}: {
  messages: ThreadMessage[];
  threadId: string;
}) {
  if (messages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No messages in this thread yet.
      </p>
    );
  }
  const displayedMessages = [...messages].reverse();

  return (
    <div className="space-y-2" aria-label={`${messages.length} email messages`}>
      {displayedMessages.map((m, index) => {
        const segments = segmentEmailBody({
          subject: m.subject,
          text: m.bodyText,
          html: m.bodyHtml,
        });
        const visibleText =
          segments.visibleText ||
          (!segments.historyText ? m.snippet?.trim() : "") ||
          (segments.isForwarded ? "Forwarded message" : "(no new text content)");
        const sentLabel = m.sentAt
          ? m.sentAt.toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : null;
        const isNewest = index === 0;

        return (
          <details
            key={m.id}
            open={isNewest}
            className="group/message overflow-hidden rounded-xl border bg-card"
          >
            <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 select-none marker:hidden [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={m.direction === "inbound" ? "secondary" : "outline"}
                  >
                    {m.direction === "inbound" ? "Received" : "Sent"}
                  </Badge>
                  <span className="truncate text-sm font-medium text-foreground">
                    {m.fromAddr ?? "Unknown sender"}
                  </span>
                  {segments.isForwarded ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Forward className="size-3.5" /> Forwarded
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {m.toAddrs?.length ? (
                    <span className="truncate">To {m.toAddrs.join(", ")}</span>
                  ) : null}
                  {m.attachments.length ? (
                    <span className="inline-flex items-center gap-1">
                      <Paperclip className="size-3.5" />
                      {m.attachments.length}
                    </span>
                  ) : null}
                </span>
              </span>
              {m.sentAt ? (
                <time
                  dateTime={m.sentAt.toISOString()}
                  title={sentLabel ?? undefined}
                  className="shrink-0 text-xs text-muted-foreground"
                >
                  {timeAgo(m.sentAt)}
                </time>
              ) : null}
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open/message:rotate-180" />
            </summary>

            <div className="space-y-4 border-t px-4 py-4">
              {m.ccAddrs?.length ? (
                <p className="break-words text-xs text-muted-foreground">
                  Cc {m.ccAddrs.join(", ")}
                </p>
              ) : null}

              <div className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                {visibleText}
              </div>

              {segments.historyText ? (
                <details className="group/history rounded-lg border bg-muted/20">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground marker:hidden select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
                    {segments.historyKind === "forwarded" ? (
                      <Forward className="size-3.5" />
                    ) : (
                      <MessageSquareReply className="size-3.5" />
                    )}
                    <span className="flex-1">
                      {segments.historyKind === "forwarded"
                        ? "Show forwarded history"
                        : "Show quoted history"}
                    </span>
                    <ChevronDown className="size-3.5 transition-transform duration-200 group-open/history:rotate-180" />
                  </summary>
                  <div className="max-h-96 overflow-auto border-t px-3 py-3 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
                    {segments.historyText}
                  </div>
                </details>
              ) : null}

              {m.attachments.length ? (
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  {m.attachments.map((attachment) => (
                    <Link
                      key={attachment.id}
                      href={`/api/files/${attachment.fileId}/download`}
                      className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-md border bg-background px-3 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">
                        <span className="block truncate">{attachment.fileName}</span>
                        <span className="block text-[11px] font-normal text-muted-foreground">
                          {formatBytes(attachment.sizeBytes)}
                        </span>
                      </span>
                      <Download className="size-3.5 shrink-0 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              ) : null}

              <div className="flex justify-end border-t pt-3">
                <MessageReprocessButton messageId={m.id} threadId={threadId} />
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}

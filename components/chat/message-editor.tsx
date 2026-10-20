"use client";

import { Check, Pencil } from "lucide-react";
import { MentionInput } from "@/components/mentions/mention-input";
import { Button } from "@/components/ui/button";
import { sendOnConversationKey } from "@/lib/chat/composer-key";
import type { MessageEditDraft } from "@/lib/chat/edit-state";
import type { MentionTarget } from "@/lib/mentions/roster";

export function MessageEditor({ draft, members, onChange, onSave, onCancel }: {
  draft: MessageEditDraft; members: MentionTarget[]; onChange: (text: string) => void; onSave: () => void; onCancel: () => void;
}) {
  const valid = !!draft.text.trim() && draft.text.trim().length <= 20000 && draft.text.trim() !== draft.originalContent;
  return <div data-chat-composer data-message-editor className="conversation-composer shrink-0 space-y-2 border-t bg-background px-3 pt-3 lg:px-4 lg:pb-3">
    <p className="flex items-center gap-2 text-xs font-medium text-foreground"><Pencil aria-hidden className="size-3.5" />Editing message</p>
    <MentionInput autoFocus aria-label="Edit message text" value={draft.text} members={members}
      onChange={onChange} rows={2} maxLength={20000} placeholder="Edit your message…"
      className="max-h-32 min-h-16 w-full resize-none rounded-xl bg-card px-3 py-2.5 text-base shadow-none"
      onKeyDown={event => {
        if (event.defaultPrevented || event.nativeEvent.isComposing) return;
        if (event.key === "Escape") { event.preventDefault(); onCancel(); return; }
        sendOnConversationKey(event, () => { if (valid) onSave(); });
      }} />
    {draft.error ? <p role="alert" className="text-sm text-destructive">{draft.error}</p> : null}
    <div className="flex justify-end gap-2">
      <Button type="button" variant="ghost" className="min-h-11" onClick={onCancel}>Cancel edit</Button>
      <Button type="button" className="min-h-11" disabled={!valid} onClick={onSave}><Check className="size-4" />Save changes</Button>
    </div>
  </div>;
}

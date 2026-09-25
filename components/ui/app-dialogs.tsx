"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, MessageSquare } from "lucide-react";
import { currentDialog, subscribeDialogs, cancelDialogs, settleDialog, type DialogRequest } from "@/lib/dialog-requests";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function RequestDialog({ request }: { request: DialogRequest }) {
  const [value, setValue] = useState(request.defaultValue ?? "");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const verb = request.message.match(/^(Delete|Remove|Discard|Revoke|Clear|Restore|Send|Leave|Close|Undo|Move)\b/i)?.[1];
  const destructive = request.destructive ?? /^(Delete|Remove|Discard|Revoke|Clear|Move)\b/i.test(request.message);
  const label = request.confirmLabel ?? (request.kind === "prompt" ? "Continue" : verb === "Move" ? "Move to trash" : verb === "Send" ? "Confirm and send" : verb ?? "Confirm");
  const title = request.title ?? (request.kind === "prompt" ? "Enter details" : `${label}?`);
  const cancel = () => settleDialog(request.id, request.kind === "prompt" ? null : false);
  return <Dialog open onOpenChange={open => { if (!open) cancel(); }}>
    <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md" initialFocus={request.kind === "prompt" ? inputRef : cancelRef}>
      <DialogHeader>
        <span className={`mb-1 flex size-10 items-center justify-center rounded-xl ${destructive ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
          {destructive ? <AlertTriangle className="size-5" /> : <MessageSquare className="size-5" />}
        </span>
        <DialogTitle className="break-words">{title}</DialogTitle>
        <DialogDescription className="whitespace-pre-line break-words leading-relaxed">{request.message}</DialogDescription>
      </DialogHeader>
      <form onSubmit={event => { event.preventDefault(); settleDialog(request.id, request.kind === "prompt" ? value : true); }} className="grid gap-4">
        {request.kind === "prompt" && <Input ref={inputRef} aria-label={request.message} value={value} onChange={event => setValue(event.target.value)} />}
        <DialogFooter>
          <Button ref={cancelRef} type="button" variant="outline" onClick={cancel}>Cancel</Button>
          <Button type="submit" variant={destructive ? "destructive" : "default"}>{label}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

export function AppDialogs() {
  const request = useSyncExternalStore(subscribeDialogs, currentDialog, () => null);
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current !== pathname) cancelDialogs();
    previousPath.current = pathname;
  }, [pathname]);
  useEffect(() => () => cancelDialogs(), []);
  return request ? <RequestDialog key={request.id} request={request} /> : null;
}

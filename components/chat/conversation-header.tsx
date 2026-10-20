"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { CHAT_LIST_HREF } from "@/lib/chat/navigation";

/** One compact mobile header, with complete identity and secondary actions on demand. */
export function ConversationHeader({ title, subtitle, backHref, onClose, actions, children }: {
  title: string;
  subtitle: string;
  backHref?: string;
  onClose?: () => void;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="conversation-header flex shrink-0 items-center gap-2 border-b bg-background px-3 py-2 lg:rounded-xl lg:border lg:p-3">
      {onClose ? (
        <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label="Close conversation" onClick={onClose}><ArrowLeft className="size-5" /></Button>
      ) : backHref ? (
        <Button variant="ghost" size="icon" className="size-11 shrink-0 lg:hidden" nativeButton={false} render={<Link href={backHref} />} aria-label="Back"><ArrowLeft className="size-5" /></Button>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold" title={title}>{title}</h1>
        <p className="truncate text-xs text-muted-foreground" title={subtitle}>{subtitle}</p>
      </div>
      <div className="hidden shrink-0 items-center gap-2 lg:flex">{actions}</div>
      <Sheet>
        <SheetTrigger render={<Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label="Conversation details" />}><MoreHorizontal className="size-5" /></SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-xl pb-[max(1rem,env(safe-area-inset-bottom))] [&_button]:min-h-11 [&_button]:min-w-11">
          <SheetHeader className="pr-14"><SheetTitle className="break-words">{title}</SheetTitle><SheetDescription>{subtitle}</SheetDescription></SheetHeader>
          <div className="space-y-4 px-4">
            {actions ? <div className="flex flex-wrap items-center gap-2 lg:hidden [&_a]:min-h-11 [&_a]:min-w-11">{actions}</div> : null}
            {children}
            <nav aria-label="Workspace navigation" className="grid grid-cols-2 gap-1 border-t pt-3">
              {[['/dashboard', 'Home'], ['/projects', 'Projects'], [CHAT_LIST_HREF, 'All chats'], ['/assistant', 'Assistant'], ['/settings/profile', 'Profile settings'], ['/help', 'Help']].map(([href, label]) => (
                <Link key={href} href={href} className="flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-muted">{label}</Link>
              ))}
            </nav>
            <div className="flex items-center justify-between border-t pt-3"><span className="text-sm">Theme</span><ThemeToggle /></div>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}

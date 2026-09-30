"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { NavigationGroup } from "@/lib/navigation";

export function SettingsDirectory({ groups }: { groups: NavigationGroup[] }) {
  const [query, setQuery] = useState("");
  const term = query.trim().toLocaleLowerCase();
  const visible = groups.map(group => ({ ...group, items: group.items.filter(item => `${group.label} ${item.label} ${item.description ?? ""}`.toLocaleLowerCase().includes(term)) })).filter(group => group.items.length);
  return <div className="space-y-6">
    <div className="relative"><Search aria-hidden className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input value={query} onChange={event => setQuery(event.target.value)} aria-label="Find a setting" placeholder="Search settings" className="min-h-11 pl-9" /></div>
    <span className="sr-only" aria-live="polite">{visible.reduce((count, group) => count + group.items.length, 0)} settings found</span>
    {visible.map(group => <section key={group.label} className="space-y-2"><h2 className="text-base font-semibold">{group.label}{group.label === "Personal" ? " · only you" : " · shared"}</h2><ul className="divide-y border-y">{group.items.map(item => <li key={item.href}><Link href={item.href} className="flex min-h-16 items-center gap-3 rounded-md px-2 py-3 outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.label}</span><span className="block text-sm text-muted-foreground">{item.description}</span></span><ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground" /></Link></li>)}</ul></section>)}
    {!visible.length ? <div className="space-y-2 py-6"><p className="font-medium">No matching settings</p><p className="text-sm text-muted-foreground">Try another word or clear your search.</p><Button variant="outline" onClick={() => setQuery("")}>Clear search</Button></div> : null}
  </div>;
}

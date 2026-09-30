import { isEpisodicKind } from "@/lib/projects/kinds";

export type NavigationItem = {
  href: string;
  label: string;
  icon: string;
  description?: string;
  access?: "manager" | "admin";
  relatedPaths?: string[];
};
export type NavigationGroup = { label: string; items: NavigationItem[] };
type Access = { canManage: boolean; isAdmin: boolean };

function visibleGroups(groups: NavigationGroup[], access: Access): NavigationGroup[] {
  return groups.map(group => ({ ...group, items: group.items.filter(item =>
    item.access === "admin" ? access.isAdmin : item.access === "manager" ? access.canManage : true
  ) })).filter(group => group.items.length > 0);
}

export function appNavigation(access: Access): NavigationGroup[] {
  return visibleGroups([
    { label: "Daily work", items: [
      { href: "/dashboard", label: "Home", icon: "home" },
      { href: "/tasks", label: "My Work", icon: "tasks" },
      { href: "/projects", label: "Projects", icon: "projects" },
    ] },
    { label: "Team", items: [
      { href: "/chat", label: "Chat", icon: "chat" },
      { href: "/standups", label: "Standups", icon: "standups" },
    ] },
    { label: "Management", items: [
      { href: "/overview", label: "Team planning", icon: "planning", access: "manager", relatedPaths: ["/schedule", "/workload"] },
      { href: "/correspondence", label: "Correspondence", icon: "mail", access: "manager" },
      { href: "/donations", label: "Donations", icon: "donations", access: "admin" },
    ] },
    { label: "Workspace", items: [
      { href: "/wiki", label: "Wiki", icon: "wiki" },
      { href: "/assistant", label: "Assistant", icon: "assistant" },
      { href: "/settings", label: "Settings", icon: "settings" },
      { href: "/help", label: "Help", icon: "help" },
    ] },
  ], access);
}

export function settingsNavigation(access: Access): NavigationGroup[] {
  return visibleGroups([
    { label: "Personal", items: [
      { href: "/settings/profile", label: "Profile", icon: "profile", description: "Your name, timezone, guidance, timer, and email assistant preferences." },
      { href: "/settings/security", label: "Security", icon: "security", access: "admin", description: "Passkeys and account security." },
      { href: "/settings/notifications", label: "Notifications", icon: "notifications", description: "Choose which work alerts you receive." },
    ] },
    { label: "Workspace", items: [
      { href: "/settings/dictionary", label: "Voice dictionary", icon: "dictionary", description: "Names and words used in voice input." },
      { href: "/settings/team", label: "Team", icon: "members", access: "manager", description: "Invite teammates and manage workspace roles." },
      { href: "/settings/workspace", label: "Workspace", icon: "workspace", access: "admin", description: "Organization identity and defaults for new projects." },
      { href: "/settings/standups", label: "Standups", icon: "standups", access: "manager", description: "Set up team check-ins and their schedules." },
    ] },
    { label: "Publishing", items: [
      { href: "/settings/roles", label: "Project roles", icon: "roles", access: "manager", description: "Publishing responsibilities and team capacity." },
      { href: "/settings/templates", label: "Templates", icon: "templates", access: "admin", description: "Reusable project stages and tasks." },
      { href: "/settings/publishers", label: "Publishers", icon: "workspace", access: "manager", description: "Publishers and their contacts for rights agreements." },
      { href: "/settings/partners", label: "Partners", icon: "partners", access: "manager", description: "Funding partners and their contacts." },
      { href: "/settings/printers", label: "Printers", icon: "print", access: "manager", description: "Printers and quote contacts." },
    ] },
    { label: "AI & email", items: [
      { href: "/settings/email", label: "Email", icon: "mail", access: "manager", description: "Correspondence address, mailbox, and shared email preferences." },
      { href: "/settings/costs", label: "AI usage", icon: "costs", access: "admin", description: "Review AI usage by task and teammate." },
      { href: "/settings/ai", label: "AI", icon: "assistant", access: "admin", description: "Models, provider access, and assistant limits." },
      { href: "/settings/document-learning", label: "Document learning", icon: "learning", access: "manager", description: "Review examples that help document extraction." },
    ] },
  ], access);
}

export function navigationItemActive(pathname: string, item: NavigationItem): boolean {
  return [item.href, ...(item.relatedPaths ?? [])].some(path => pathname === path || pathname.startsWith(`${path}/`));
}

export function projectNavigation(slug: string, kind?: string | null) {
  const base = `/projects/${slug}`;
  return {
    daily: [
      { href: base, label: "Overview", icon: "home" },
      { href: `${base}/tasks`, label: "Tasks", icon: "tasks" },
      { href: `${base}/chat`, label: "Chat", icon: "chat" },
    ],
    publishing: [
      { href: `${base}/rights`, label: "Rights", icon: "security" },
      { href: `${base}/budget`, label: "Budget", icon: "budget" },
      isEpisodicKind(kind)
        ? { href: `${base}/episodes`, label: kind === "video_series" ? "Videos" : "Episodes", icon: kind === "video_series" ? "video" : "episodes" }
        : { href: `${base}/print`, label: "Print", icon: "print" },
    ],
    members: { href: `${base}/members`, label: "Members", icon: "members" },
  };
}

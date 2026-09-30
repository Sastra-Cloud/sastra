import {
  LayoutDashboard, BriefcaseBusiness, FolderKanban, MessageSquare, Sunrise,
  Gauge, Mail, HandCoins, BookOpenText, Sparkles, Settings, CircleHelp,
  IdCard, ShieldCheck, Bell, Mic, Users, Building2, Settings2, LayoutTemplate,
  Handshake, Printer, CircleDollarSign, BookOpenCheck, WalletCards, Video, Podcast,
  type LucideIcon,
} from "lucide-react";

export const navigationIcons: Record<string, LucideIcon> = {
  home: LayoutDashboard, tasks: BriefcaseBusiness, projects: FolderKanban,
  chat: MessageSquare, standups: Sunrise, planning: Gauge, mail: Mail,
  donations: HandCoins, wiki: BookOpenText, assistant: Sparkles, settings: Settings,
  help: CircleHelp, profile: IdCard, security: ShieldCheck, notifications: Bell,
  dictionary: Mic, members: Users, workspace: Building2, roles: Settings2,
  templates: LayoutTemplate, partners: Handshake, print: Printer,
  costs: CircleDollarSign, learning: BookOpenCheck, budget: WalletCards,
  video: Video, episodes: Podcast,
};

import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { listChatSidebar } from "@/lib/chat/queries";
import { ChatWorkspaceShell } from "@/components/chat/chat-workspace-shell";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireUser();
  const sidebar = await listChatSidebar(user.id);

  return (
    <ChatWorkspaceShell
      sidebar={sidebar}
      canCreate={can(user, "chat.createChannel")}
    >
      {children}
    </ChatWorkspaceShell>
  );
}

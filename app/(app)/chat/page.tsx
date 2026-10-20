import { redirect } from "next/navigation";

import { ChatIndexPanel } from "@/components/chat/chat-workspace-shell";
import { requireUser } from "@/lib/auth/guards";
import { getLastVisitedChannelId } from "@/lib/chat/queries";

export const metadata = { title: "Chat" };
export const dynamic = "force-dynamic";

export default async function ChatIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const { user } = await requireUser();
  const { view } = await searchParams;

  // Back and All chats must still reach the conversation list on phones.
  if (view !== "list") {
    const channelId = await getLastVisitedChannelId(user.id);
    if (channelId) redirect(`/chat/${channelId}`);
  }

  return <ChatIndexPanel />;
}

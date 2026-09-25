import { ChatIndexPanel } from "@/components/chat/chat-workspace-shell";

export const metadata = { title: "Chat" };
export const dynamic = "force-dynamic";

export default function ChatIndexPage() {
  return <ChatIndexPanel />;
}

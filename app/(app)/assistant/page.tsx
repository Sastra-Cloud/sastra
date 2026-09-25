import { requireUser } from "@/lib/auth/guards";
import { getBudgetStatus } from "@/lib/assistant/budget";
import { getPendingActions, getThread } from "@/lib/assistant/queries";
import { getMemoryState } from "@/lib/assistant/memory";
import { AssistantWorkspace } from "@/components/assistant/assistant-workspace";

export const metadata = { title: "Assistant" };
export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const { user } = await requireUser();
  const [messages, pending, budget, memory] = await Promise.all([
    getThread(user.id),
    getPendingActions(user.id),
    getBudgetStatus(user.id),
    getMemoryState(user.id),
  ]);

  return (
    <AssistantWorkspace
      userName={user.name}
      messages={messages}
      pending={pending}
      budget={budget}
      memory={memory}
    />
  );
}

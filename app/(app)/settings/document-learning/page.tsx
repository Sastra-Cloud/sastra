import { requireRole } from "@/lib/auth/guards";
import { isAdminRole } from "@/lib/auth/policy";
import { documentLearningEnabled, listDocumentCases } from "@/lib/document-learning/service";
import { DocumentLearningManager } from "@/components/settings/document-learning-manager";
import { isHostedInstance } from "@/lib/hosted/mode";

export const metadata = { title: "Document learning" };
export const dynamic = "force-dynamic";

export default async function DocumentLearningPage() {
  const { user } = await requireRole("manager");
  const [enabled, cases] = await Promise.all([documentLearningEnabled(), listDocumentCases()]);
  return <DocumentLearningManager enabled={enabled} canPause={isAdminRole(user)} canShare={isAdminRole(user) && isHostedInstance()} cases={cases} />;
}

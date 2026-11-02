import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { requireRole } from "@/lib/auth/guards";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { ContentColumn, PageShell } from "@/components/cockpit";
import { ProposalBudgetBuilder } from "@/components/budget/proposal-budget-builder";

export const metadata = { title: "New proposal budget" };
export const dynamic = "force-dynamic";

export default async function NewProposalBudgetPage() {
  await requireRole("manager");
  const workspace = await getWorkspaceSettings();
  return <PageShell>
    <div className="space-y-2">
      <Link href="/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Projects</Link>
      <h1 className="font-heading text-3xl font-semibold tracking-tight">New proposal budget</h1>
      <p className="text-muted-foreground">Build an estimate for a book or project you are still considering.</p>
    </div>
    <ContentColumn width="focused"><ProposalBudgetBuilder defaults={{
      currency: workspace.defaultCurrency, sourceLanguage: workspace.sourceLanguage, targetLanguage: workspace.targetLanguage,
      wordsPerPage: workspace.wordsPerPage, languageExpansionFactor: workspace.languageExpansionFactor,
      rateTranslation: workspace.rateTranslation, rateProofreading: workspace.rateProofreading, rateEditing: workspace.rateEditing,
      rateCoverDesign: workspace.rateCoverDesign, rateTypesetting: workspace.rateTypesetting, rateProjectManagement: workspace.rateProjectManagement,
      ratePrintShip: workspace.ratePrintShip, rateAudiobook: workspace.rateAudiobook, rateVideoSeries: workspace.rateVideoSeries,
    }} /></ContentColumn>
  </PageShell>;
}

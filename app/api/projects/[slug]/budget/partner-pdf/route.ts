import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/guards";
import { buildPerCopyQuotationPdf } from "@/lib/budget/pdf";
import { getBudgetData } from "@/lib/budget/queries";
import { getProjectHeader } from "@/lib/projects/queries";
import { getWorkspaceSettings } from "@/lib/workspace/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { slug } = await params;
  const project = await getProjectHeader(slug);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const searchParams = new URL(request.url).searchParams;
  const runId = searchParams.get("run") || undefined;
  const disposition = searchParams.get("inline") === "1" ? "inline" : "attachment";
  const [{ settings, presentation }, workspace] = await Promise.all([
    getBudgetData(project.id, runId),
    getWorkspaceSettings(),
  ]);
  if (
    !presentation ||
    presentation.mode !== "per_copy" ||
    !presentation.perCopyQuantity ||
    !presentation.perCopyUnitPrice
  ) {
    return NextResponse.json(
      { error: "Complete the per-copy partner quote first." },
      { status: 400 }
    );
  }
  const contactName =
    [
      settings.partnerContactFirstName,
      settings.partnerContactLastName,
    ]
      .filter(Boolean)
      .join(" ") || null;
  const buffer = await buildPerCopyQuotationPdf({
    issuerName: workspace.legalName || workspace.orgName,
    accentColor: workspace.accentColor,
    projectTitle: project.title,
    partnerName: settings.partnerName,
    contactName,
    description:
      presentation.publicDescription ||
      settings.workDescription ||
      project.title,
    quantity: presentation.perCopyQuantity,
    unitPrice: Number(presentation.perCopyUnitPrice),
    currency: settings.currency,
  });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${slug}-partner-quotation.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

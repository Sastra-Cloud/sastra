import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { getProjectHeader } from "@/lib/projects/queries";
import {
  buildAllocatedQuotationBuffer,
  buildPartnerQuotationBuffer,
  buildQuotationBuffer,
} from "@/lib/budget/quotation-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
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

  const url = new URL(request.url);
  const runId = url.searchParams.get("run") || undefined;
  const quotationId = url.searchParams.get("quotation");
  // Same boundary as sending the proposal: every role that may edit budgets.
  if (quotationId && !can(session.user, "budget.edit"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const audience = url.searchParams.get("audience");
  let buffer: Buffer;
  try {
    buffer = quotationId
      ? await buildAllocatedQuotationBuffer(
          project.id,
          project.title,
          quotationId,
          runId,
          project.kind,
        )
      : audience === "partner"
        ? await buildPartnerQuotationBuffer(
            project.id,
            project.title,
            runId,
            project.kind,
          )
        : await buildQuotationBuffer(
            project.id,
            project.title,
            runId,
            project.kind,
          );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not export." },
      { status: 400 },
    );
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${slug}-${
        audience === "partner" ? "partner-" : "internal-"
      }quotation.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

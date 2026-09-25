import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/guards";
import { getProjectHeader } from "@/lib/projects/queries";
import {
  buildPartnerQuotationBuffer,
  buildQuotationBuffer,
} from "@/lib/budget/quotation-file";

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

  const url = new URL(request.url);
  const runId = url.searchParams.get("run") || undefined;
  const audience = url.searchParams.get("audience");
  let buffer: Buffer;
  try {
    buffer =
      audience === "partner"
        ? await buildPartnerQuotationBuffer(
            project.id,
            project.title,
            runId,
            project.kind
          )
        : await buildQuotationBuffer(
            project.id,
            project.title,
            runId,
            project.kind
          );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not export." },
      { status: 400 }
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

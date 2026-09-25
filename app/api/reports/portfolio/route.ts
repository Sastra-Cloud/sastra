import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { buildPortfolioWorkbook } from "@/lib/reports/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!can(session.user, "reports.export")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const wb = await buildPortfolioWorkbook();
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="portfolio-report.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}

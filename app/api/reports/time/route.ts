import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { buildTimeWorkbook } from "@/lib/reports/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!can(session.user, "reports.export")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  if ((from && !YMD.test(from)) || (to && !YMD.test(to))) {
    return NextResponse.json(
      { error: "from/to must be yyyy-mm-dd" },
      { status: 400 }
    );
  }

  const wb = await buildTimeWorkbook({ from, to });
  const buffer = await wb.xlsx.writeBuffer();
  const suffix = [from, to].filter(Boolean).join("_");
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="time-report${suffix ? `-${suffix}` : ""}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

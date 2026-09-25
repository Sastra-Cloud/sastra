import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { invoices, projects } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function money(value: string | number, currency: string) {
  const n = Number(value) || 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  await requireUser();
  const { invoiceId } = await params;
  const [invoice] = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      recipientName: invoices.recipientName,
      recipientEmail: invoices.recipientEmail,
      amount: invoices.amount,
      currency: invoices.currency,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      description: invoices.description,
      notes: invoices.notes,
      sourceFileId: invoices.sourceFileId,
      renderedFileId: invoices.renderedFileId,
      issuerSnapshot: invoices.issuerSnapshot,
      projectTitle: projects.title,
    })
    .from(invoices)
    .innerJoin(projects, eq(projects.id, invoices.projectId))
    .where(eq(invoices.id, invoiceId))
    .limit(1);

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  // Historical invoices keep their original uploaded PDF/image instead of
  // recreating a lookalike HTML invoice from extracted fields.
  const fileId = invoice.sourceFileId || invoice.renderedFileId;
  if (fileId) {
    const inline = new URL(request.url).searchParams.get("inline") === "1";
    // Relative Location preserves the browser's public origin behind reverse proxies.
    return new Response(null, {
      status: 307,
      headers: { Location: `/api/files/${fileId}/download${inline ? "?inline=1" : ""}`, "Cache-Control": "private, no-store" },
    });
  }

  const issuer = invoice.issuerSnapshot;
  const issuerName = issuer?.legalName || issuer?.orgName;
  const issuerDetails = [
    ...(issuer?.address ?? []),
    issuer?.contactEmail,
    issuer?.contactPhone,
    issuer?.registrationNumber ? `Registration: ${issuer.registrationNumber}` : null,
    issuer?.taxId ? `Tax ID: ${issuer.taxId}` : null,
  ].filter(Boolean);

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Invoice ${escapeHtml(invoice.invoiceNumber)}</title>
  <style>
    body { margin: 0; background: #f6f3ee; color: #1f1d2b; font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { max-width: 760px; margin: 32px auto; background: white; border: 1px solid #ded7cc; padding: 48px; }
    header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 1px solid #ded7cc; padding-bottom: 24px; }
    h1 { margin: 0; font-size: 32px; line-height: 1.1; }
    h2 { margin: 32px 0 8px; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: #6f6a63; }
    .meta { text-align: right; color: #4f4a44; }
    .muted { color: #6f6a63; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th, td { padding: 12px 0; border-bottom: 1px solid #e9e3d8; text-align: left; }
    th:last-child, td:last-child { text-align: right; }
    .total { font-size: 20px; font-weight: 700; }
    @media print { body { background: white; } main { border: 0; margin: 0; max-width: none; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        ${issuerName ? `<strong>${escapeHtml(issuerName)}</strong>` : ""}
        <h1>Invoice</h1>
        <p class="muted">${escapeHtml(invoice.projectTitle)}</p>
      </div>
      <div class="meta">
        <strong>No. ${escapeHtml(invoice.invoiceNumber)}</strong><br />
        Issued ${escapeHtml(invoice.issueDate)}<br />
        Due ${escapeHtml(invoice.dueDate ?? invoice.issueDate)}
      </div>
    </header>

    ${issuerDetails.length ? `<h2>From</h2><p>${issuerDetails.map(escapeHtml).join("<br />")}</p>` : ""}

    <h2>Bill To</h2>
    <p>
      ${escapeHtml(invoice.recipientName || "MoU partner")}<br />
      ${invoice.recipientEmail ? escapeHtml(invoice.recipientEmail) : ""}
    </p>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${escapeHtml(invoice.description)}</td>
          <td>${escapeHtml(money(invoice.amount, invoice.currency))}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td class="total">Total</td>
          <td class="total">${escapeHtml(money(invoice.amount, invoice.currency))}</td>
        </tr>
      </tfoot>
    </table>

    ${invoice.notes ? `<h2>Notes</h2><p>${escapeHtml(invoice.notes)}</p>` : ""}
    ${issuer?.paymentInstructions ? `<h2>Payment instructions</h2><p>${escapeHtml(issuer.paymentInstructions).replaceAll("\n", "<br />")}</p>` : ""}
  </main>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

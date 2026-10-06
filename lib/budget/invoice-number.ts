import "server-only";

import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoiceSequences } from "@/lib/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** All invoice types consume the same atomic workspace sequence. */
export async function nextInvoiceNumber(tx: Tx): Promise<string> {
  const configured = Number.parseInt(process.env.INVOICE_NUMBER_START ?? "1", 10);
  const start = Number.isFinite(configured) && configured > 0 ? configured : 1;
  await tx.insert(invoiceSequences).values({ id: "default", nextNumber: start }).onConflictDoNothing();
  const [row] = await tx.update(invoiceSequences).set({
    nextNumber: sql`${invoiceSequences.nextNumber} + 1`, updatedAt: new Date(),
  }).where(eq(invoiceSequences.id, "default")).returning({
    issuedNumber: sql<number>`${invoiceSequences.nextNumber} - 1`,
    padding: invoiceSequences.padding, prefix: invoiceSequences.prefix,
  });
  return `${row.prefix}${String(row.issuedNumber).padStart(row.padding, "0")}`;
}

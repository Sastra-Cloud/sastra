import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { resolveOpenRouterApiKey } from "@/lib/ai/keys";
import { db } from "@/lib/db";
import {
  donationCsvFormats,
  donationImports,
  donations,
  files,
  securityEvents,
} from "@/lib/db/schema";
import { deleteObject, getObjectBuffer, headObject } from "@/lib/r2";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import {
  DonationCsvError,
  donationCsvHeaderSignature,
  donationFileHash,
  MAX_DONATION_CSV_BYTES,
  previewDonationTable,
  readDonationCsv,
  SensitiveDonationColumnsError,
  type DonationCsvResult,
  type DonationCsvTable,
} from "./csv";
import {
  GIVING_PLATFORM_MAPPING,
  formatNameFromFilename,
  isGivingPlatformExport,
  suggestDonationCsvMapping,
  type DonationCsvMapping,
} from "./csv-format";
import { classifyDonationRow, donationCandidateKey } from "./dedupe";
import type { DonationCsvFormatProposal, DonationImportResult } from "./types";

const CSV_MIME_TYPES = ["text/csv", "application/vnd.ms-excel"];
const ALREADY_IMPORTED = "This exact file was already imported. No rows were added.";
const UNREADABLE = "Sastra could not read this CSV. Check the file and try again.";

type DonationUpload = typeof files.$inferSelect;

export type LoadedDonationCsv = {
  file: DonationUpload;
  fileHash: string;
  table: DonationCsvTable;
  currency: string;
};

function money(value: number): string {
  return value.toFixed(2);
}

function cents(value: string | number): number {
  return Math.round(Number(value) * 100);
}

/**
 * Load the admin's own verified donation upload and split it into rows.
 * Sensitive columns delete the upload and record a security event.
 */
export async function loadDonationCsv(
  fileId: string,
  userId: string
): Promise<LoadedDonationCsv | DonationImportResult> {
  const [file] = await db
    .select()
    .from(files)
    .where(eq(files.id, fileId))
    .limit(1);
  if (
    !file ||
    file.status !== "ready" ||
    file.purpose !== "donation_import" ||
    file.uploadedBy !== userId
  ) {
    return { error: "The uploaded file is not ready. Try again." };
  }
  if (!file.originalName.toLowerCase().endsWith(".csv")) {
    return { error: "Choose a CSV file." };
  }
  if (
    file.sizeBytes <= 0 ||
    file.sizeBytes > MAX_DONATION_CSV_BYTES ||
    !CSV_MIME_TYPES.includes(file.mimeType)
  ) {
    return { error: "The CSV is larger than 5 MB. Split it and try again." };
  }

  try {
    const actual = await headObject(file.r2Key);
    const actualType =
      actual.contentType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    if (
      actual.size <= 0 ||
      actual.size > MAX_DONATION_CSV_BYTES ||
      !CSV_MIME_TYPES.includes(actualType) ||
      actualType !== file.mimeType
    ) {
      return { error: "The uploaded CSV could not be verified." };
    }
    const buffer = await getObjectBuffer(file.r2Key, {
      maxBytes: MAX_DONATION_CSV_BYTES,
    });
    const fileHash = donationFileHash(buffer);
    const [existingImport] = await db
      .select({ id: donationImports.id })
      .from(donationImports)
      .where(eq(donationImports.fileHash, fileHash))
      .limit(1);
    if (existingImport) {
      return {
        importId: existingImport.id,
        alreadyImported: true,
        error: ALREADY_IMPORTED,
      };
    }
    const table = readDonationCsv(buffer.toString("utf8"));
    const workspace = await getWorkspaceSettings();
    return { file, fileHash, table, currency: workspace.defaultCurrency };
  } catch (error) {
    if (error instanceof SensitiveDonationColumnsError) {
      return rejectSensitiveDonationUpload(file, userId, error);
    }
    return donationCsvErrorResult(error);
  }
}

export function isLoadedDonationCsv(
  value: LoadedDonationCsv | DonationImportResult
): value is LoadedDonationCsv {
  return "table" in value;
}

/** Show the file's own problem, or a generic message for anything else. */
export function donationCsvErrorResult(error: unknown): DonationImportResult {
  return {
    error:
      error instanceof DonationCsvError
        ? `${error.message} Check the file and try again.`
        : UNREADABLE,
  };
}

async function rejectSensitiveDonationUpload(
  file: DonationUpload,
  userId: string,
  error: SensitiveDonationColumnsError
): Promise<DonationImportResult> {
  let objectDeleted = false;
  try {
    await deleteObject(file.r2Key);
    objectDeleted = true;
  } catch {
    // Keep the failed record so the daily cleanup can retry the deletion.
  }
  await db.transaction(async (tx) => {
    await tx.insert(securityEvents).values({
      actorId: userId,
      event: "donation_upload_rejected_sensitive_columns",
      method: error.headers.join(", ").slice(0, 500),
    });
    if (objectDeleted) {
      await tx.delete(files).where(eq(files.id, file.id));
    } else {
      await tx
        .update(files)
        .set({ status: "failed" })
        .where(eq(files.id, file.id));
    }
  });
  return {
    error:
      "This CSV contains payment or identity columns Sastra does not accept. Export a reduced donation report and try again.",
  };
}

/** The built-in export or a saved format with exactly these headers. */
export async function findDonationCsvFormat(headers: string[]): Promise<{
  id: string | null;
  name: string | null;
  mapping: DonationCsvMapping;
} | null> {
  if (isGivingPlatformExport(headers)) {
    return { id: null, name: null, mapping: GIVING_PLATFORM_MAPPING };
  }
  const [saved] = await db
    .select({
      id: donationCsvFormats.id,
      name: donationCsvFormats.name,
      mapping: donationCsvFormats.mapping,
    })
    .from(donationCsvFormats)
    .where(
      eq(donationCsvFormats.headerSignature, donationCsvHeaderSignature(headers))
    )
    .limit(1);
  return saved ?? null;
}

/** Header-rule suggestion and dry run for a format the admin must review. */
export async function buildDonationCsvProposal(
  loaded: LoadedDonationCsv
): Promise<DonationCsvFormatProposal> {
  const { headers, rows } = loaded.table;
  const suggestion = suggestDonationCsvMapping(headers, rows);
  const preview = previewDonationTable(loaded.table, suggestion.mapping, {
    currency: loaded.currency,
  });
  return {
    fileId: loaded.file.id,
    sourceFilename: loaded.file.originalName,
    headers,
    name: formatNameFromFilename(loaded.file.originalName),
    mapping: suggestion.mapping,
    preview,
    needsAi: suggestion.missingRequired.length > 0 || preview.error !== null,
    aiAvailable: Boolean(await resolveOpenRouterApiKey()),
    currency: loaded.currency,
  };
}

/** Save or replace the reviewed mapping for this header layout. */
export async function saveDonationCsvFormat(input: {
  headers: string[];
  name: string;
  mapping: DonationCsvMapping;
  userId: string;
}): Promise<void> {
  const now = new Date();
  await db
    .insert(donationCsvFormats)
    .values({
      name: input.name,
      headerSignature: donationCsvHeaderSignature(input.headers),
      headers: input.headers,
      mapping: input.mapping,
      createdBy: input.userId,
      lastUsedAt: now,
    })
    .onConflictDoUpdate({
      target: donationCsvFormats.headerSignature,
      set: {
        name: input.name,
        headers: input.headers,
        mapping: input.mapping,
        updatedAt: now,
        lastUsedAt: now,
      },
    });
}

export async function markDonationCsvFormatUsed(formatId: string) {
  await db
    .update(donationCsvFormats)
    .set({ lastUsedAt: new Date() })
    .where(eq(donationCsvFormats.id, formatId));
}

/** Add only rows not seen in any earlier import, inside one locked transaction. */
export async function recordDonationImport(input: {
  loaded: LoadedDonationCsv;
  parsed: DonationCsvResult;
  formatName: string | null;
  userId: string;
}): Promise<DonationImportResult> {
  const { loaded, parsed, userId } = input;
  const { file, fileHash, currency } = loaded;
  const workspace = await getWorkspaceSettings();
  const existing = await db
    .select({
      id: donations.id,
      rowFingerprint: donations.rowFingerprint,
      donorKey: donations.donorKey,
      amount: donations.amount,
      donationDate: donations.donationDate,
    })
    .from(donations);
  const dedupeState = {
    exactFingerprints: new Set(existing.map((row) => row.rowFingerprint)),
    possibleByDonorAmountDate: new Map<string, string>(
      existing.map((row) => [
        donationCandidateKey({
          rowFingerprint: row.rowFingerprint,
          donorKey: row.donorKey,
          amountCents: cents(row.amount),
          donationDate: row.donationDate,
        }),
        row.id,
      ])
    ),
  };

  let exactDuplicateRows = 0;
  let possibleDuplicateRows = 0;
  const newRows: Array<
    (typeof donations)["$inferInsert"] & { duplicateOfId: string | null }
  > = [];
  for (const row of parsed.successfulRows) {
    const id = randomUUID();
    const classification = classifyDonationRow(dedupeState, row, id);
    if (classification.kind === "exact_duplicate") {
      exactDuplicateRows += 1;
      continue;
    }
    const duplicateOfId = classification.duplicateOfId;
    if (duplicateOfId) possibleDuplicateRows += 1;
    newRows.push({
      id,
      importId: "",
      sourceRowNumber: row.sourceRowNumber,
      rowFingerprint: row.rowFingerprint,
      campaignExternalId: row.campaignExternalId,
      donor: row.donor,
      donorKey: row.donorKey,
      campaign: row.campaign,
      recurring: row.recurring,
      amount: money(row.amount),
      currency,
      paymentMethod: row.paymentMethod,
      sourceStatus: row.sourceStatus,
      donationDate: row.donationDate,
      sourceDateTime: row.sourceDateTime,
      notes: row.notes,
      reviewStatus: duplicateOfId ? "possible_duplicate" : "needs_review",
      duplicateOfId,
    });
  }

  const imported = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`donation-file:${file.id}`}))`
    );
    const [lockedFile] = await tx
      .select({ id: files.id })
      .from(files)
      .where(
        and(
          eq(files.id, file.id),
          eq(files.status, "ready"),
          eq(files.purpose, "donation_import"),
          eq(files.uploadedBy, userId)
        )
      )
      .limit(1);
    if (!lockedFile) throw new Error("donation file unavailable");

    const [existingLocked] = await tx
      .select({ id: donationImports.id })
      .from(donationImports)
      .where(
        or(
          eq(donationImports.fileId, file.id),
          eq(donationImports.fileHash, fileHash)
        )
      )
      .limit(1);
    if (existingLocked) {
      return { batch: existingLocked, alreadyImported: true };
    }

    const [batch] = await tx
      .insert(donationImports)
      .values({
        fileId: file.id,
        sourceFilename: file.originalName,
        formatName: input.formatName,
        fileHash,
        currency,
        rowCount: parsed.rowCount,
        successfulRows: parsed.successfulRows.length,
        failedRows: parsed.failedRows,
        newRows: newRows.length,
        exactDuplicateRows,
        possibleDuplicateRows,
        successfulAmount: money(parsed.successfulAmount),
        createdBy: userId,
        sourceRetentionUntil: new Date(
          Date.now() +
            workspace.donationSourceRetentionDays * 24 * 60 * 60 * 1000
        ),
      })
      .returning({ id: donationImports.id });
    if (newRows.length > 0) {
      await tx.insert(donations).values(
        newRows.map((row) => ({
          ...row,
          importId: batch.id,
        }))
      );
    }
    return { batch, alreadyImported: false };
  });
  if (imported.alreadyImported) {
    return {
      importId: imported.batch.id,
      alreadyImported: true,
      error: ALREADY_IMPORTED,
    };
  }
  revalidatePath("/donations");
  return {
    importId: imported.batch.id,
    newRows: newRows.length,
    exactDuplicateRows,
    possibleDuplicateRows,
    failedRows: parsed.failedRows,
  };
}

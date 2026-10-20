"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AiBudgetExceededError } from "@/lib/ai/usage";
import { requireDonationAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { donationCsvFormats } from "@/lib/db/schema";
import { parseDonationTable, previewDonationTable } from "./csv";
import {
  DONATION_CSV_FIELDS,
  defaultSuccessStatuses,
  donationCsvMappingProblems,
  type DonationCsvField,
  type DonationCsvMapping,
} from "./csv-format";
import { suggestDonationCsvMappingWithAi } from "./csv-format-ai";
import {
  donationCsvErrorResult,
  isLoadedDonationCsv,
  loadDonationCsv,
  recordDonationImport,
  saveDonationCsvFormat,
} from "./import-ledger";
import type { DonationCsvPreview, DonationImportResult } from "./types";

const headerInput = z.string().trim().min(1).max(300).nullable();

const mappingInput = z.object({
  columns: z.object(
    Object.fromEntries(
      DONATION_CSV_FIELDS.map(({ field }) => [field, headerInput])
    ) as Record<DonationCsvField, typeof headerInput>
  ),
  successStatuses: z.array(z.string().trim().max(300)).max(50),
  dateOrder: z.enum(["mdy", "dmy"]),
});

const learnInput = z.object({
  fileId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  mapping: mappingInput,
});

type PreviewResult = {
  preview?: DonationCsvPreview;
  mapping?: DonationCsvMapping;
  error?: string;
};

/**
 * Dry-run a column mapping against the uploaded file. Adds nothing. After the
 * status column changes, `defaultStatuses` pre-selects the clearly successful
 * values and returns the adjusted mapping.
 */
export async function getDonationCsvPreview(
  fileId: string,
  mapping: DonationCsvMapping,
  options: { defaultStatuses?: boolean } = {}
): Promise<PreviewResult> {
  const { user } = await requireDonationAdmin();
  const parsedMapping = mappingInput.safeParse(mapping);
  if (!z.string().uuid().safeParse(fileId).success || !parsedMapping.success) {
    return { error: "Choose the columns again." };
  }
  const loaded = await loadDonationCsv(fileId, user.id);
  if (!isLoadedDonationCsv(loaded)) return { error: loaded.error };
  const next: DonationCsvMapping = options.defaultStatuses
    ? {
        ...parsedMapping.data,
        successStatuses: defaultSuccessStatuses(
          loaded.table.headers,
          loaded.table.rows,
          parsedMapping.data.columns.status
        ),
      }
    : parsedMapping.data;
  const problems = donationCsvMappingProblems(loaded.table.headers, next);
  return {
    mapping: next,
    preview: {
      ...previewDonationTable(loaded.table, next, {
        currency: loaded.currency,
      }),
      ...(problems.length ? { error: problems[0] } : {}),
    },
  };
}

/** Ask AI to suggest the columns for an unfamiliar CSV. The admin still reviews it. */
export async function generateDonationCsvMapping(fileId: string): Promise<
  PreviewResult & { mapping?: DonationCsvMapping; name?: string | null }
> {
  const { user } = await requireDonationAdmin();
  if (!z.string().uuid().safeParse(fileId).success) {
    return { error: "The uploaded file is not ready. Try again." };
  }
  const loaded = await loadDonationCsv(fileId, user.id);
  if (!isLoadedDonationCsv(loaded)) return { error: loaded.error };
  try {
    const suggestion = await suggestDonationCsvMappingWithAi({
      headers: loaded.table.headers,
      rows: loaded.table.rows,
      actorUserId: user.id,
    });
    if (!suggestion) {
      return { error: "AI could not suggest the columns. Choose them below." };
    }
    return {
      mapping: suggestion.mapping,
      name: suggestion.name,
      preview: previewDonationTable(loaded.table, suggestion.mapping, {
        currency: loaded.currency,
      }),
    };
  } catch (error) {
    if (error instanceof AiBudgetExceededError) {
      return { error: `${error.message} Choose the columns below.` };
    }
    console.error("Donation CSV format suggestion failed:", error);
    return { error: "AI could not suggest the columns. Choose them below." };
  }
}

/**
 * Save the reviewed column mapping for this header layout, then import the
 * file. Later files with the same headers import without this step.
 */
export async function learnDonationCsvFormat(input: {
  fileId: string;
  name: string;
  mapping: DonationCsvMapping;
}): Promise<DonationImportResult> {
  const { user } = await requireDonationAdmin();
  const parsedInput = learnInput.safeParse(input);
  if (!parsedInput.success) {
    return { error: "Give the format a name and choose its columns." };
  }
  const { fileId, name, mapping } = parsedInput.data;
  const loaded = await loadDonationCsv(fileId, user.id);
  if (!isLoadedDonationCsv(loaded)) return loaded;
  const problems = donationCsvMappingProblems(loaded.table.headers, mapping);
  if (problems.length) return { error: problems[0] };

  try {
    const parsed = parseDonationTable(loaded.table, mapping, {
      currency: loaded.currency,
    });
    if (parsed.successfulRows.length === 0) {
      return {
        error: "No row counts as money received. Check the payment status choices.",
      };
    }
    const result = await recordDonationImport({
      loaded,
      parsed,
      formatName: name,
      userId: user.id,
    });
    if (!result.error || result.alreadyImported) {
      await saveDonationCsvFormat({
        headers: loaded.table.headers,
        name,
        mapping,
        userId: user.id,
      });
      revalidatePath("/donations");
    }
    return result;
  } catch (error) {
    return donationCsvErrorResult(error);
  }
}

/** Forget a saved format. Its next file asks for the columns again. */
export async function deleteDonationCsvFormat(
  formatId: string
): Promise<{ ok?: true; error?: string }> {
  await requireDonationAdmin();
  if (!z.string().uuid().safeParse(formatId).success) {
    return { error: "This format was not found." };
  }
  await db.delete(donationCsvFormats).where(eq(donationCsvFormats.id, formatId));
  revalidatePath("/donations");
  return { ok: true };
}

import "server-only";

import { and, eq, gt, inArray, isNotNull, ne, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { files, wikiMedia } from "@/lib/db/schema";

import { getEntitlement } from "./entitlements";
import { hostedAccountUrl, isHostedInstance } from "./mode";
import { checkStorageAvailable, type StorageCheck, type StorageUsage } from "./storage";

/** Uploads that never finished stop counting after a day (the nightly cleanup removes them). */
const PENDING_COUNTS_FOR_MS = 24 * 3600_000;

/**
 * Bytes the workspace keeps in file storage: attachments, imports, generated
 * files, and wiki images and videos. Uploads in progress count, so two large
 * uploads at once cannot both slip under the limit.
 */
export async function storageUsedBytes(options: { excludeFileId?: string } = {}): Promise<number> {
  const recent = new Date(Date.now() - PENDING_COUNTS_FOR_MS);
  const [[fileBytes], [mediaBytes]] = await Promise.all([
    db
      .select({ total: sql<string | null>`sum(${files.sizeBytes})` })
      .from(files)
      .where(
        and(
          or(eq(files.status, "ready"), and(eq(files.status, "pending"), gt(files.createdAt, recent))),
          options.excludeFileId ? ne(files.id, options.excludeFileId) : undefined
        )
      ),
    db
      .select({ total: sql<string | null>`sum(${wikiMedia.sizeBytes})` })
      .from(wikiMedia)
      .where(
        and(
          isNotNull(wikiMedia.r2Key),
          or(
            inArray(wikiMedia.status, ["processing", "ready"]),
            and(eq(wikiMedia.status, "pending"), gt(wikiMedia.createdAt, recent))
          )
        )
      ),
  ]);
  return Number(fileBytes?.total ?? 0) + Number(mediaBytes?.total ?? 0);
}

export async function storageUsage(options: { excludeFileId?: string } = {}): Promise<StorageUsage> {
  const [usedBytes, entitlement] = await Promise.all([storageUsedBytes(options), getEntitlement()]);
  return { usedBytes, limitBytes: entitlement?.storageLimitBytes ?? null };
}

/**
 * Whether a new upload of `incomingBytes` fits the plan's file space. Always
 * fine when self-hosted. System work (captured email, generated files) is never
 * refused; only uploads people start are checked.
 */
export async function assertStorageAvailable(
  incomingBytes: number,
  options: { excludeFileId?: string } = {}
): Promise<StorageCheck> {
  if (!isHostedInstance()) return { ok: true };
  return checkStorageAvailable(await storageUsage(options), incomingBytes, hostedAccountUrl());
}

/**
 * File-space rules for hosted workspaces. Pure so they are unit-testable; the
 * database-backed usage lives in `storage-usage.ts`. Self-hosted installations
 * have no limit.
 */

export type StorageUsage = {
  usedBytes: number;
  /** null = unlimited */
  limitBytes: number | null;
};

export type StorageCheck = { ok: true } | { ok: false; error: string };

const GB = 1024 ** 3;
const MB = 1024 ** 2;

/** "3.2 GB", "450 MB", "20 GB": short and plain for the settings card and errors. */
export function formatBytes(bytes: number): string {
  if (bytes >= GB) {
    const gb = bytes / GB;
    return `${gb >= 10 || Number.isInteger(gb) ? Math.round(gb) : gb.toFixed(1)} GB`;
  }
  if (bytes >= MB) return `${Math.max(1, Math.round(bytes / MB))} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function storageFullMessage(usage: StorageUsage & { limitBytes: number }, accountUrl: string | null): string {
  const base = `Your workspace is out of file space. It uses ${formatBytes(usage.usedBytes)} of ${formatBytes(usage.limitBytes)}. Delete files you no longer need`;
  return accountUrl ? `${base}, or get more space at ${accountUrl}.` : `${base}, or contact us for more space.`;
}

/** Whether a file of `incomingBytes` fits in the space that is left. */
export function checkStorageAvailable(
  usage: StorageUsage,
  incomingBytes: number,
  accountUrl: string | null
): StorageCheck {
  if (usage.limitBytes === null) return { ok: true };
  if (usage.usedBytes + incomingBytes <= usage.limitBytes) return { ok: true };
  return { ok: false, error: storageFullMessage({ ...usage, limitBytes: usage.limitBytes }, accountUrl) };
}

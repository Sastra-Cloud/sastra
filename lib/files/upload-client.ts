"use client";

import { toast } from "sonner";

/**
 * Upload a single file to R2 via the presign → PUT → complete flow and return
 * its file id (or null on failure, having shown a toast). The file is marked
 * `ready` but left unattached — callers decide what to do with the id.
 */
export async function uploadFile(file: File): Promise<string | null> {
  const contentType = file.type || "application/octet-stream";

  const presign = await fetch("/api/files/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      contentType,
      sizeBytes: file.size,
    }),
  });
  if (!presign.ok) {
    const { error } = await presign
      .json()
      .catch(() => ({ error: "Upload failed" }));
    toast.error(`${file.name}: ${error}`);
    return null;
  }
  const { fileId, uploadUrl } = await presign.json();

  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!put.ok) {
    toast.error(`${file.name}: upload failed`);
    return null;
  }

  const complete = await fetch("/api/files/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId }),
  });
  if (!complete.ok) {
    toast.error(`${file.name}: could not finalize`);
    return null;
  }
  return fileId as string;
}

/** Donation-only upload path with admin assurance and a strict 5 MB CSV limit. */
export async function uploadDonationCsv(file: File): Promise<string | null> {
  const contentType =
    file.type === "application/vnd.ms-excel" ? file.type : "text/csv";
  const presign = await fetch("/api/donations/files/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      contentType,
      sizeBytes: file.size,
    }),
  });
  if (!presign.ok) {
    const body = await presign.json().catch(() => null);
    toast.error(body?.error || "Could not prepare the donation upload.");
    return null;
  }
  const { fileId, uploadUrl } = await presign.json();
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!put.ok) {
    toast.error("The donation CSV upload failed.");
    return null;
  }
  const complete = await fetch("/api/donations/files/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId }),
  });
  if (!complete.ok) {
    const body = await complete.json().catch(() => null);
    toast.error(body?.error || "Could not verify the donation CSV.");
    return null;
  }
  return fileId as string;
}

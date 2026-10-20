import type { Attachment } from "@/lib/files/queries";

export type ChatImage = {
  attachmentId: string;
  fileId: string;
  name: string;
  sizeBytes: number;
  src: string;
  downloadUrl: string;
};

/** Keep the message's image order, independently of documents and voice clips. */
export function chatMessageImages(attachments: readonly Attachment[]): ChatImage[] {
  return attachments
    .filter((attachment) => attachment.mimeType.startsWith("image/"))
    .map((attachment) => ({
      attachmentId: attachment.attachmentId,
      fileId: attachment.fileId,
      name: attachment.originalName,
      sizeBytes: attachment.sizeBytes,
      src: `/api/files/${attachment.fileId}/download?inline=1`,
      downloadUrl: `/api/files/${attachment.fileId}/download`,
    }));
}

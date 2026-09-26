import "server-only";

// Public entry points for the correspondence hub (IMAP poll, inbound webhooks, send).
export {
  canSendAsCorrespondenceAddress,
  getCaptureMailbox,
  getCorrespondenceAddress,
  getCorrespondenceCaptureSource,
  getMailboxConfig,
  isCorrespondenceCaptureEnabled,
  isGmailCaptureEnabled,
  mailboxManagedByServer,
  type CaptureSource,
  type MailboxConfig,
} from "./config";
export {
  ingestRawMessage,
  loadRawMessage,
  runCaptureSync,
  syncRecentPrintProofAttachments,
  syncStoredMessageAttachments,
  type IngestEvent,
  type RawIngestResult,
} from "./sync";
export { MAX_RAW_MESSAGE_BYTES, type IngestSource } from "./raw";
export { sendEmail, type SendEmailInput, type SendEmailResult } from "./send";

export type MutationInteractionMode =
  | "optimistic"
  | "confirmed-destructive"
  | "progress"
  | "navigation"
  | "read"
  | "unclassified";

// `sync*` are silent, idempotent background reconciliations (no user gesture,
// no pending/progress UI) — treated like reads for the interaction contract.
const READ = /^(reviewPrintWirePayment|get|list|load|current|is[A-Z]|sync|pushSupported)/;
const READ_ACTIONS = new Set(["markChannelRead"]); // silent background read receipt
const DESTRUCTIVE = /^(delete|remove|revoke|clear|discard|trash)/;
const PROGRESS = /^(send|submit|draft|generate|publish|refresh|reprocess|repair|retry|upload|extract|startParse|startNow|startReprint|resume|applyImport|commitImport|attachAgreement|createImport|createProjectsFrom|enablePush|disablePush|runAssistant|request|invite|learn|seed)/;
const PROGRESS_ACTIONS = new Set([
  "copyMessageText", // Wait for clipboard permission/write before reporting success.
  "promptInstall", // Native browser prompt: wait for the person's choice.
  "uploadToMessage", // Picked, pasted, and dropped files upload only after Send, with progress.
  "submitSupportRequest",
  "sendSupportReply",
  "uploadSupportAttachment",
  "downloadSupportAttachment",
  "connectCorrespondenceMailbox",
  "updateWorkspaceSettings",
  "updateStandup",
  "approveFundingReview",
  "consolidatePrintInvoicePayment",
  "confirmSharedMouDelivery",
  "approveAllAssistantActions",
  "approveAssistantAction",
  "approveEmailRightsReview",
  "acceptEmailProjectUpdateSuggestion",
  "bulkCreateEpisodes",
  "bulkUpdateEpisodes",
  "createBudgetApprovalRequest",
  "createDonationImportFromFile",
  "createPrintRun",
  "createQuoteFromFile",
  "createQuoteFromText",
  "createRecurringTask",
  "enableBudgetPresentation",
  "markPaymentPaid",
  "confirmDonationAllocations",
  "confirmDonationMouPaymentMatch",
  "resolveDonationDuplicate",
  "setDonationUnallocated",
  // Confirmed bulk review: server-computed counts, then Undo for duplicates.
  "resolveDonationDuplicates",
  "reopenDonationDuplicates",
  "setDonationsUnallocated",
  "initiateRightsStep",
  "resetBudgetLineRate",
  "resetPassword",
  "runDependencySecurityCheck",
  "runEmailSignalReflectionNow",
  "saveEmailDraft",
  "setProfileImage",
  "verifyAdminSecurityCode",
  "updateVideoProductionMode",
  "updateOpenRouterApiKey", // credential save: never shown as done before the server confirms
  "saveImportAsLesson",
  "reviewEmailAttachmentAsDocument",
  "enterImportManually",
  "startManualEmailRightsReview",
  "contributeDocumentCase",
  "setImportTargetProject",
  "recordSponsorshipReceipt", // reviewed finance allocation, atomic server computation
  "reverseSponsorshipReceipt",
  "recordSponsorshipFundUse",
  "reverseSponsorshipFundUse",
]);
const CONFIRMED_DESTRUCTIVE_ACTIONS = new Set([
  "undoAutoCreatedEmailTask",
  "voidMouInvoice",
  "voidSponsorshipInvoice",
  "cancelSponsorship",
]);
const OPTIMISTIC_ACTIONS = new Set([
  // Message menus retain immediate text/reaction feedback; uploads have their own progress action.
  "postMessage",
  "toggleReaction",
  "editMessage", // Text and Edited marker update immediately; failure restores the edit draft.
  "setTaskNextUp", // shared task selection: immediate state with rollback
  // Chat message pins: predictable, reversible, and rolled back on failure.
  "pinMessage",
  "unpinMessage",
  "resetGuidanceTips",
  "applySuggestedPartnerRates",
  "applySuggestedPerCopyPrice",
  "saveBudgetPresentation",
  "splitFundingIntoTwoPayments",
]);
const NAVIGATION = new Set([
  "bootstrapAdmin",
  "completeWorkspaceSetup",
  "acceptInvite",
  "createChannel",
  "openDirectMessage",
  "createProject",
  "createSponsorship",
  "commitPlan",
  "commitProjectPlan",
]);
const OPTIMISTIC = /^(accept|add|approve|assign|bulk|complete|create|decline|dismiss|edit|initiate|link|log|mark|merge|move|post|promote|rate|reject|reopen|replace|reply|reorder|reset|resolve|restore|retire|review|rollback|set|shift|snooze|startTimer|stop|toggle|unlink|update)/;

/** Classify every client-invoked action so new interaction code has an explicit UX contract. */
export function interactionModeFor(actionName: string): MutationInteractionMode {
  if (READ.test(actionName) || READ_ACTIONS.has(actionName)) return "read";
  if (NAVIGATION.has(actionName)) return "navigation";
  if (CONFIRMED_DESTRUCTIVE_ACTIONS.has(actionName)) return "confirmed-destructive";
  if (DESTRUCTIVE.test(actionName)) return "confirmed-destructive";
  if (PROGRESS_ACTIONS.has(actionName)) return "progress";
  if (PROGRESS.test(actionName)) return "progress";
  if (OPTIMISTIC_ACTIONS.has(actionName)) return "optimistic";
  if (OPTIMISTIC.test(actionName)) return "optimistic";
  return "unclassified";
}

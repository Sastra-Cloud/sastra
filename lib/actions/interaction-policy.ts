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
const READ_ACTIONS = new Set(["previewDefaultProjectPeople", "markChannelRead", "readSchedule", "reviewLectioLink", "findLectioProjectMatches", "permissionState"]); // signed review reads; permissionState is a synchronous browser permission read
const DESTRUCTIVE = /^(delete|remove|revoke|clear|discard|trash)/;
const PROGRESS = /^(send|submit|draft|generate|publish|refresh|reprocess|repair|retry|upload|extract|startParse|startNow|startReprint|resume|applyImport|commitImport|attachAgreement|createImport|createProjectsFrom|enablePush|disablePush|runAssistant|request|invite|learn|seed)/;
const PROGRESS_ACTIONS = new Set([
  "updatePayment", // An unsent invoice and its payment save atomically after the PDF is ready.
  "updateBudgetSettings", // Partner saves may refresh unsent PDF invoices; wait for canonical files.
  "saveDefaultProjectPeople", // Reviewed defaults affect future project access.
  "applyDefaultProjectPeople", // Reviewed bulk grants await canonical counts.
  "createPrintEstimateFromText", // AI extraction then atomic suggestions; budget selection stays explicit.
  "linkSocial", // Google consent is external; show pending until navigation, then re-read the grant.
  "selectPrintEstimateQuote", // Reviewed financial estimate selection; await canonical budget sync.
  "stopUsingPrintEstimateQuote", // Reverses that selection; await canonical budget sync.
  "linkLectioProject",
  "createLectioProjectForReview",
  "confirmLectioPerson",
  "reapproveLectioConnection",
  "previewLectioProject",
  "setLectioConnectionState",
  "resolveLectioReopen",
  "disconnectLectioProject", // Confirmed locally; remote disconnection is delivered durably.
  "previewLectioMapping",
  "updateLectioMapping",
  "saveLectioSetup",
  "rotateLectioConnectionKeys",
  "configureLectioSharedSignIn",
  "confirmLectioLink",
  "startLectioSignIn",
  "updateSchedule", // Lectio waits for Sastra's canonical dates before reporting success.
  "copyMessageText", // Wait for clipboard permission/write before reporting success.
  "draftMouProposal", // Preparing a reviewable partner email never sends it.
  "promptInstall", // Native browser prompt: wait for the person's choice.
  "uploadToMessage", // Picked, pasted, and dropped files upload only after Send, with progress.
  "prepareChatVideo", // Local video work: real progress, cancellation, and recoverable drafts.
  "submitSupportRequest",
  "sendSupportReply",
  "uploadSupportAttachment",
  "downloadSupportAttachment",
  "connectCorrespondenceMailbox",
  "updateWorkspaceSettings",
  "updateStandup",
  "approveFundingReview",
  "saveAgreementFundingPartner", // Reviewed partner link: wait for the saved partner before invoices use it.
  "consolidatePrintInvoicePayment",
  "confirmSharedMouDelivery",
  "approveAllAssistantActions",
  "approveAssistantAction",
  "approveEmailRightsReview",
  "acceptEmailProjectUpdateSuggestion",
  "bulkCreateEpisodes",
  "bulkUpdateEpisodes",
  "approveBudgetApprovalAssignment", // Financial sign-off waits for canonical approval and protected task updates.
  "requestBudgetApprovalChanges",
  "createBudgetApprovalRequest", // Budget or individual proposal sign-off: wait for server-created review tasks.
  "createBudgetLineInvoice", // Reviewed financial calculation and PDF generation.
  "previewBudgetLineInvoice", // Read-only review; no invoice is created.
  "createDonationImportFromFile",
  "createPrintRun",
  "createGuidedBudget", // Guided setup saves size, costs, and partner together; keep the form on failure.
  "createQuoteFromFile",
  "createQuoteFromText",
  "createRecurringTask",
  "enableBudgetPresentation",
  "markPaymentPaid",
  "confirmDonationAllocations",
  "confirmDonationMouPaymentMatch", // Review the selected payment and any amount difference before posting.
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
  "unlinkLectioSignIn",
  "undoAutoCreatedEmailTask",
  "voidMouInvoice",
  "voidSponsorshipInvoice",
  "cancelSponsorship",
]);
const OPTIMISTIC_ACTIONS = new Set([
  "createPartner", // Show the partner/contact together; remove both on failure and keep the form draft.
  "addProjectPerson", // Review chat-history access, then show the person immediately.
  "setTaskPinned", // Personal reference only; immediate pin/unpin with rollback.
  "updatePrintSettings", // Overview book details and Print share immediate values with rollback.
  "addProjectManager", // Explicit permission confirmation precedes immediate assignment feedback.
  // Message menus retain immediate text/reaction feedback; uploads have their own progress action.
  // Quoted replies use the same optimistic send and restore draft/context on failure.
  // @channel asks for confirmation first, then uses the same send/rollback flow.
  "postMessage",
  "toggleReaction", // Desktop quick actions and message menus share immediate feedback and rollback.
  "editMessage", // Text and Edited marker update immediately; failure restores the edit draft.
  "dismissEmailQuoteSuggestion", // Review-only: hide the suggestion immediately; never reverse accepted finance.
  "dismissEmailFundingReview", // Unapproved document review only; restore the card on failure.
  "setTaskNextUp", // shared task selection: immediate state with rollback
  "setTaskAssignmentDeferred", // personal Later planning: immediate regrouping with rollback
  "markPrintPaymentPaid", // reviewed confirmation: update payment/task immediately, roll back on failure
  // Chat message pins: predictable, reversible, and rolled back on failure.
  "pinMessage",
  "unpinMessage",
  "resetGuidanceTips",
  "applySuggestedPartnerRates",
  "undoSuggestedPartnerRates", // Restore public rates immediately, with conflict checks and rollback.
  "applySuggestedPerCopyPrice",
  "saveBudgetPresentation",
  "savePartnerQuotation", // Partner-specific shares update immediately, then reconcile or restore the draft.
  "savePartnerQuote", // Typed quote edits stay visible drafts. "Apply fee coverage" shows new prices at once, saves them with the line rates, and restores the draft on failure.
  "updateBudgetLine", // Includes partner visibility: immediate totals and per-line rollback.
  "splitFundingIntoTwoPayments",
]);
const NAVIGATION = new Set([
  "bootstrapAdmin",
  "completeWorkspaceSetup",
  "acceptInvite",
  "createChannel",
  "reloadForAppUpdate", // Explicit full reload; never replay a pending mutation.
  "openDirectMessage",
  "createProject",
  "createProposalBudget", // Save the complete estimate atomically, then open its Budget.
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

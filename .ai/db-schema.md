# Drizzle Schema

Table and enum exports parsed from `lib/db/schema/`.

## `lib/db/schema/activity.ts`

- `activityLog` (pgTable)

## `lib/db/schema/agreement-chat.ts`

- `agreementChatMessages` (pgTable)
- `agreementChatThreads` (pgTable)
- `agreementDocumentChunks` (pgTable)
- `agreementDocuments` (pgTable)

## `lib/db/schema/agreements.ts`

- `sharedMouGroups` (pgTable)
- `sharedMouMembershipAudits` (pgTable)
- `sharedMouMemberships` (pgTable)

## `lib/db/schema/ai.ts`

- `aiPlanDrafts` (pgTable)
- `aiTaskModels` (pgTable)
- `aiUsageEvents` (pgTable)
- `aiUsageSettings` (pgTable)

## `lib/db/schema/app.ts`

- `emailPreferences` (pgTable)
- `invitations` (pgTable)
- `projectRoles` (pgTable)
- `userRoleCapacity` (pgTable)
- `workspaceSettings` (pgTable)

## `lib/db/schema/assistant.ts`

- `assistantConversationSummaries` (pgTable)
- `assistantEvalCases` (pgTable)
- `assistantFeedback` (pgTable)
- `assistantLessons` (pgTable)
- `assistantMemory` (pgTable)
- `assistantMemoryFacts` (pgTable)
- `assistantMessages` (pgTable)
- `assistantPendingActions` (pgTable)
- `assistantReflectionRuns` (pgTable)
- `assistantSettings` (pgTable)
- `assistantTraceEvents` (pgTable)
- `assistantTraceRuns` (pgTable)
- `assistantUsage` (pgTable)

## `lib/db/schema/auth.ts`

- `account` (pgTable)
- `adminAssuranceChallenges` (pgTable)
- `adminTrustedDevices` (pgTable)
- `passkey` (pgTable)
- `rateLimit` (pgTable)
- `securityEvents` (pgTable)
- `session` (pgTable)
- `teamRole` (pgEnum)
- `user` (pgTable)
- `userAvatars` (pgTable)
- `userGuidanceDismissals` (pgTable)
- `verification` (pgTable)

## `lib/db/schema/blockers.ts`

- `blockers` (pgTable)

## `lib/db/schema/budget.ts`

- `budgetApprovalAssignments` (pgTable)
- `budgetApprovalRequests` (pgTable)
- `budgetItems` (pgTable)
- `budgetScopePresentations` (pgTable)
- `fundingReceipts` (pgTable)
- `invoiceDeliveries` (pgTable)
- `invoices` (pgTable)
- `invoiceSequences` (pgTable)
- `mouPaymentProjects` (pgTable)
- `mouPayments` (pgTable)
- `projectBudgetSettings` (pgTable)
- `proposalSubmissions` (pgTable)
- `royaltyPayments` (pgTable)
- `sharedMouReceiptAllocations` (pgTable)
- `sharedMouReceipts` (pgTable)

## `lib/db/schema/chat.ts`

- `channelReads` (pgTable)
- `chatChannelMembers` (pgTable)
- `chatChannels` (pgTable)
- `chatMessages` (pgTable)
- `messageReactions` (pgTable)
- `projectChatPins` (pgTable)

## `lib/db/schema/cron.ts`

- `cronRuns` (pgTable)

## `lib/db/schema/dictionary.ts`

- `dictionaryTerms` (pgTable)

## `lib/db/schema/donations.ts`

- `donationAllocations` (pgTable)
- `donationImports` (pgTable)
- `donationReviews` (pgTable)
- `donations` (pgTable)

## `lib/db/schema/email-drafts.ts`

- `emailDrafts` (pgTable)

## `lib/db/schema/email.ts`

- `emailFollowUps` (pgTable)
- `emailMessages` (pgTable)
- `emailProjectSuggestions` (pgTable)
- `emailProjectUpdateSuggestions` (pgTable)
- `emailRightsReviews` (pgTable)
- `emailSignalLessons` (pgTable)
- `emailTaskFeedback` (pgTable)
- `emailTaskRules` (pgTable)
- `emailTaskSuggestions` (pgTable)
- `emailThreadProjects` (pgTable)
- `emailThreads` (pgTable)
- `gmailAccounts` (pgTable)

## `lib/db/schema/enums.ts`

- `agreementType` (pgEnum)
- `attachTarget` (pgEnum)
- `blockerType` (pgEnum)
- `budgetCategory` (pgEnum)
- `budgetGroup` (pgEnum)
- `budgetUnit` (pgEnum)
- `channelKind` (pgEnum)
- `draftStatus` (pgEnum)
- `emailDirection` (pgEnum)
- `emailProjectSuggestionStatus` (pgEnum)
- `emailTaskActionKind` (pgEnum)
- `emailTaskFeedbackSignal` (pgEnum)
- `emailTaskRuleScope` (pgEnum)
- `emailTaskRuleStatus` (pgEnum)
- `emailTaskSuggestionMode` (pgEnum)
- `emailThreadStatus` (pgEnum)
- `filePurpose` (pgEnum)
- `fileStatus` (pgEnum)
- `gmailConnectionType` (pgEnum)
- `importStatus` (pgEnum)
- `messageStatus` (pgEnum)
- `obligationCadence` (pgEnum)
- `obligationKind` (pgEnum)
- `podcastStage` (pgEnum)
- `printFundingStatus` (pgEnum)
- `priority` (pgEnum)
- `projectKind` (pgEnum)
- `projectStatus` (pgEnum)
- `rightsOverall` (pgEnum)
- `rightsStepStatus` (pgEnum)
- `severity` (pgEnum)
- `standupRunStatus` (pgEnum)
- `taskStatus` (pgEnum)
- `unitStatus` (pgEnum)
- `videoProductionMode` (pgEnum)

## `lib/db/schema/files.ts`

- `fileAttachments` (pgTable)
- `files` (pgTable)

## `lib/db/schema/hosted.ts`

- `hostedEntitlements` (pgTable)
- `hostedManagementEvents` (pgTable)

## `lib/db/schema/imports.ts`

- `documentImports` (pgTable)

## `lib/db/schema/notifications.ts`

- `notificationEmailQueue` (pgTable)
- `notifications` (pgTable)
- `pushSubscriptions` (pgTable)

## `lib/db/schema/obligations.ts`

- `licenseObligations` (pgTable)

## `lib/db/schema/partners.ts`

- `partnerContacts` (pgTable)
- `partners` (pgTable)

## `lib/db/schema/presence.ts`

- `userPresence` (pgTable)

## `lib/db/schema/print.ts`

- `printContacts` (pgTable)
- `printEmailLessons` (pgTable)
- `printExtractionJobs` (pgTable)
- `printPayments` (pgTable)
- `printQuotes` (pgTable)
- `printRuns` (pgTable)
- `printThreadLinks` (pgTable)
- `projectPrintSettings` (pgTable)

## `lib/db/schema/project-surface-notes.ts`

- `projectSurfaceNotes` (pgTable)

## `lib/db/schema/project-updates.ts`

- `projectUpdates` (pgTable)

## `lib/db/schema/projects.ts`

- `phases` (pgTable)
- `podcastStageSettings` (pgTable)
- `projectMembers` (pgTable)
- `projects` (pgTable)
- `units` (pgTable)

## `lib/db/schema/recurring.ts`

- `recurringTasks` (pgTable)

## `lib/db/schema/rights.ts`

- `licenseFeePayments` (pgTable)
- `licenseRenewalReminders` (pgTable)
- `rightsContacts` (pgTable)
- `rightsHolders` (pgTable)
- `rightsItems` (pgTable)

## `lib/db/schema/snapshots.ts`

- `projectSnapshots` (pgTable)

## `lib/db/schema/standup.ts`

- `standupAnswers` (pgTable)
- `standupParticipants` (pgTable)
- `standupQuestions` (pgTable)
- `standupReports` (pgTable)
- `standupRuns` (pgTable)
- `standups` (pgTable)

## `lib/db/schema/tasks.ts`

- `taskComments` (pgTable)
- `taskDependencies` (pgTable)
- `taskDriveFiles` (pgTable)
- `tasks` (pgTable)

## `lib/db/schema/templates.ts`

- `phaseTemplates` (pgTable)
- `planTemplates` (pgTable)
- `taskTemplates` (pgTable)

## `lib/db/schema/time.ts`

- `timeEntries` (pgTable)

## `lib/db/schema/wiki.ts`

- `wikiMedia` (pgTable)
- `wikiPages` (pgTable)
- `wikiRevisionMedia` (pgTable)
- `wikiRevisions` (pgTable)
- `wikiSearchChunks` (pgTable)
- `wikiSubjects` (pgTable)

# Donor data inventory and retention

Owner approval is required before automatic source-file deletion is enabled.
This document is operational guidance, not legal advice.

| Data | Purpose | Application access | Proposed retention |
|---|---|---|---|
| Reviewed donation ledger | Receipt reconciliation, duplicate defense, project funding, tax/accounting support | Assured admins | Organization-approved accounting period |
| Allocation and duplicate history | Audit trail for financial decisions | Assured admins | At least the ledger period |
| Original source CSV | Short-term import evidence and recovery | Assured admins | 30 days after successful import, pending approval |
| File hash, source filename, import totals | Idempotency and reconciliation | Assured admins | Ledger period |
| Pending or rejected upload | Upload recovery only | Uploader/admin | 24 hours |
| Security events | Investigation without donor content | Operators/admins | 1 year |
| Application logs and Sentry | Reliability and incident diagnosis | Restricted operators | 30 days unless under incident/legal hold |
| Browser response | Current admin task | Current assured admin | `no-store`; no offline caching |

Current release behavior:

- parsed ledger and review history are retained;
- original CSV deletion is disabled while
  `workspace_settings.donation_source_retention_days` is null;
- each future configured import snapshots its own retention deadline;
- a legal-hold flag prevents a future cleanup job from deleting the source;
- CSV contents, donor names, notes, and amounts must not be copied into logs or
  monitoring events.

Before enabling cleanup, record the approver, approval date, chosen periods,
backup implications, legal-hold owner, and a restore-test result.

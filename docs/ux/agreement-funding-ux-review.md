# Agreement funding and invoicing UX review

The user supplied three screens and asked for a connected journey from agreement
funding through invoicing and received money. The existing project interface,
UX-designer guidance, and Emil Kowalski's design-engineering principles guide
this refinement. It preserves the existing page layout and uses inline review.

## User journey

1. Open **Rights & MOUs**. Review permissions, then **Agreement funding**:
   promised amounts, payment terms, percentage calculations, received money,
   and anything requiring review.
2. Follow **Review payments** to Budget's main-project **Payments** tab. The
   destination tab opens even when it was previously hidden.
3. Review an installment with no saved amount. Its expected amount is prefilled
   when a percentage and a reliable source total are available. The total and
   percentage remain editable; the calculation changes immediately.
4. Save missing amounts, then follow **Review received funding** to **Cash flow**.
   An admin can match an existing donation to its expected payment. This reuses
   the receipt and requires the existing security check and financial review.
5. Return to the unpaid installment. **Save & generate invoice** saves the
   reviewed amount before requesting a PDF. Keep progress visible until the
   server responds. Creating a PDF does not send an email or record money.
6. Review the PDF and use the existing **Email invoice** review to check the
   recipient, CC list, message, and attachment before explicitly sending.
7. When money arrives, record or link its receipt. Overview, Budget, and
   Rights & MOUs refresh the same financial model.

## Findings and changes

| Before | After | Why |
| --- | --- | --- |
| A percentage installment appeared as $0 or Amount TBD. | Show its calculation and prefill a reviewable amount. | Users should not need a calculator or mistake an unknown amount for zero. |
| A fixed fee prevented percentage amounts from being resolved. | Calculate stated percentages independently of other fixed rows. | Separate obligations must not change the percentage base. |
| Agreement funding was absent from Rights & MOUs. | Show the shared funding summary and source terms beside rights context. | Users can see both permission and funding obligations before acting. |
| Three screens described funding with different figures and labels. | Use one read model for promised, received, outstanding, and available amounts. | A screen change should preserve the meaning of the financial facts. |
| An unlinked receipt could make an unpaid balance look more certain than it was. | Count actual cash once and show that receipt links need review. | Do not silently assign a receipt or imply that an installment is settled. |
| A fee payable to the licensor appeared as incoming funding. | Exclude it from promised-income summaries and offer fee review. | Payment direction changes who owes whom. Preserve the ledger until explicitly corrected. |
| Incomplete schedules could trigger a misleading funding-gap or overdue warning. | Ask for funding review first. | The next action should repair the evidence before asking for money. |
| Saving an amount and generating an invoice required separate navigation. | Offer Save & generate invoice in the inline editor. | Keep the reviewed amount, terms, and next action together. |
| Invoice preparation could fail after the amount was saved. | Keep the saved amount and reopen the entered values with a retry message. | Financial writes must not appear rolled back when they succeeded. |
| A retained receipt form could keep an old default after installment amounts changed. | Select a unique exact match when the review opens; keep ties as explicit choices. | New payment data should be reflected without silently choosing between equal installments. |
| A donation security check returned users to the global Donations page. | Preserve the Budget receipt-review destination through verification. | Security should protect the action without losing the user’s place. |
| Returning to Rights & MOUs could show an old funding panel. | Invalidate that page after payment and donation-link updates. | Stale money figures can lead to duplicate billing. |

## Financial and interaction rules

- Promises never become available cash. Available funds are net recorded
  receipts minus recorded spend.
- Calculated amounts are clearly provisional until saved. Conflicting totals
  and unknown percentages remain for human review.
- Received totals count each receipt once. Per-commitment linked receipts remain
  separate from unlinked money. Do not infer which installment a receipt settled.
- Keep currencies, reprint budgets, and sponsorship funds separate.
- Maintain finance-role checks, admin donation security checks, invoice
  immutability, and explicit email-send review.
- Preserve ordinary optimistic edits and rollback. Invoice preparation uses
  truthful pending feedback and prevents repeat submissions.
- Use persistent labels, currency-bearing values, inline errors, and keyboard
  focus. Numeric financial changes apply immediately without count animations.

## Verification

Focused tests cover percentage arithmetic, fixed-fee separation, rounding,
ambiguous totals, receipt reuse, unconfirmed and confirmed funding summaries,
role boundaries, invoice preparation order, duplicate submission, failure
recovery, and cross-page invalidation. Browser verification uses disposable
local records; production diagnostics remain read-only. No production invoice,
receipt, or email is created during this review.

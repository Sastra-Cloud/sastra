"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, ClipboardCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { useNavigationBadgeAdjustment } from "@/components/navigation-badges-provider";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { dismissEmailFundingReview, dismissEmailQuoteSuggestion } from "@/lib/email/review-actions";
import { getPrintQuoteTotal } from "@/lib/print/quote-economics";

type Quote = {
  id: string;
  projectSlug: string;
  projectTitle: string;
  title: string | null;
  kind: string;
  quantityCps: number | null;
  totalAmount: string | null;
  unitPrice: string | null;
  currency: string;
};
type FundingReview = { id: string; status: string; fundingSourceKey: string | null; fileName: string | null };
type ReviewState = { quotes: Quote[]; fundingReviews: FundingReview[] };
type Dismissal = { kind: "quote" | "funding"; id: string };

const dismissKey = (input: Dismissal) => `${input.kind}:${input.id}`;
const money = (value: number, currency: string) => `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dismissItem = (state: ReviewState, input: Dismissal): ReviewState => input.kind === "quote"
  ? { ...state, quotes: state.quotes.filter((quote) => quote.id !== input.id) }
  : { ...state, fundingReviews: state.fundingReviews.filter((review) => review.id !== input.id) };

const DESTINATIONS: Record<string, { href: string; instruction: string; action: string }> = {
  "Project updates": { href: "#review-project-updates", instruction: "Post the suggested update or dismiss it.", action: "Review updates" },
  "Rights documents": { href: "#review-rights-documents", instruction: "Approve the document or dismiss the suggestion.", action: "Review rights" },
  "Unassigned follow-up": { href: "#review-follow-up", instruction: "Choose an owner below, snooze the follow-up, or resolve it.", action: "Review follow-up" },
};

export function ThreadReviewChecklist({ threadId, reviewLabels, quotes, fundingReviews }: {
  threadId: string;
  reviewLabels: string[];
  quotes: Quote[];
  fundingReviews: FundingReview[];
}) {
  const router = useRouter();
  const source = useMemo(() => ({ quotes, fundingReviews }), [quotes, fundingReviews]);
  const mutation = useOptimisticAction({ state: source, update: dismissItem, getKey: dismissKey });
  const labels = reviewLabels.filter((label) =>
    !(label === "Printer quotes" && quotes.length > 0 && mutation.state.quotes.length === 0) &&
    !(label === "Funding documents" && fundingReviews.length > 0 && mutation.state.fundingReviews.length === 0)
  );
  const complete = labels.length === 0;
  useNavigationBadgeAdjustment("correspondence", reviewLabels.length > 0 && complete ? -1 : 0);

  const dismiss = (input: Dismissal) => {
    if (mutation.isPending(dismissKey(input))) return;
    mutation.run(input, async () => {
      try {
        return input.kind === "quote"
          ? await dismissEmailQuoteSuggestion({ threadId, id: input.id })
          : await dismissEmailFundingReview({ threadId, id: input.id });
      } catch {
        return { error: "Could not dismiss the suggestion. Check your connection and try again." };
      }
    }, {
      errorMessage: "Could not dismiss the suggestion. Check your connection and try again.",
      onSuccess: () => { toast.success("Suggestion dismissed"); router.refresh(); },
    });
  };

  return (
    <section aria-labelledby="email-review-heading" className="rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        {complete ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success-text" /> : <ClipboardCheck className="mt-0.5 size-5 shrink-0 text-primary" />}
        <div className="min-w-0 space-y-1">
          <h2 id="email-review-heading" className="text-base font-semibold" aria-live="polite">{complete ? "Review complete" : "Finish email review"}</h2>
          <p className="text-sm text-muted-foreground">{complete
            ? "This thread has no shared reviews left. It no longer counts in Needs review."
            : "Resolve each item below to clear this thread from the badge. Setting its status to Done does not clear suggestions."}</p>
        </div>
      </div>

      {complete ? (
        <div className="mt-4" aria-live="polite">
          {mutation.pending ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> Saving review…</p> :
            <Link href="/correspondence?bucket=review" className={buttonVariants({ size: "sm", className: "min-h-11 sm:min-h-8" })}>Back to Needs review <ArrowRight className="size-4" /></Link>}
        </div>
      ) : (
        <ul className="mt-4 divide-y">
          {labels.map((label) => {
            const destination = label === "Project suggestions"
              ? { href: `/correspondence/${threadId}/review`, instruction: "Create or link the projects, or dismiss the suggestions.", action: "Review projects" }
              : DESTINATIONS[label];
            return <li key={label} className="space-y-2 py-3 first:pt-0 last:pb-0">
              <h3 className="text-sm font-medium">{label}</h3>
              {destination ? <>
                <p className="text-xs text-muted-foreground">{destination.instruction}</p>
                <Link href={destination.href} className={buttonVariants({ variant: "outline", size: "sm", className: "min-h-11 sm:min-h-8" })}>{destination.action}<ArrowRight className="size-3.5" /></Link>
              </> : null}
              {label === "Printer quotes" ? <>
                <p className="text-xs text-muted-foreground">Review prices in Print. Dismiss suggestions you do not need. Approved quotes stay unchanged.</p>
                {mutation.state.quotes.map((quote) => {
                  const total = getPrintQuoteTotal(quote);
                  return <div key={quote.id} className="space-y-2 rounded-lg bg-muted/40 p-3">
                    <p className="break-words text-sm font-medium">{quote.title || quote.projectTitle}</p>
                    <p className="text-xs text-muted-foreground">{[quote.kind.replaceAll("_", " "), quote.quantityCps ? `${quote.quantityCps.toLocaleString()} copies` : null, total ? `${money(total.totalCost, quote.currency)}${total.calculated ? " (calculated)" : ""}` : "Price needs checking"].filter(Boolean).join(" · ")}</p>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/projects/${quote.projectSlug}/print#print-quote-${quote.id}`} className={buttonVariants({ variant: "outline", size: "sm", className: "min-h-11 sm:min-h-8" })}>Review in Print</Link>
                      <Button variant="ghost" size="sm" className="min-h-11 sm:min-h-8" onClick={() => dismiss({ kind: "quote", id: quote.id })}>Dismiss suggestion</Button>
                    </div>
                  </div>;
                })}
              </> : null}
              {label === "Funding documents" ? <>
                <p className="text-xs text-muted-foreground">Approve the funding or dismiss an unneeded review. Dismissing keeps the source document.</p>
                {mutation.state.fundingReviews.map((review, index) => <div key={review.id} className="space-y-2 rounded-lg bg-muted/40 p-3">
                  <p className="break-words text-sm font-medium">{review.fileName || `Funding document ${index + 1}`}</p>
                  <div className="flex flex-wrap items-center gap-2">
                  <Link href={review.fundingSourceKey ? `/agreements/review/${review.id}` : `/projects/import/${review.id}`} className={buttonVariants({ variant: "outline", size: "sm", className: "min-h-11 sm:min-h-8" })}>{review.status === "failed" ? "Retry funding review" : "Review MoU funding"}</Link>
                  <Button variant="ghost" size="sm" className="min-h-11 sm:min-h-8" onClick={() => dismiss({ kind: "funding", id: review.id })}>Dismiss review</Button>
                  </div>
                </div>)}
              </> : null}
            </li>;
          })}
        </ul>
      )}
    </section>
  );
}

import { requireUser } from "@/lib/auth/guards";
import { LectioLinkReview } from "@/components/lectio/link-review";

export const metadata = { title: "Confirm Lectio account" };
export default async function LectioLinkReviewPage() {
  await requireUser();
  return <LectioLinkReview />;
}

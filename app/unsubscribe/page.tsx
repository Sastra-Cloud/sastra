import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { submitUnsubscribe } from "@/lib/notifications/actions";

export const metadata = { title: "Unsubscribe" };

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; category?: string; done?: string }>;
}) {
  const sp = await searchParams;
  const token = sp.token ?? "";
  const category = sp.category === "all"
    ? "all"
    : sp.category === "standup"
      ? "standup"
      : "workflow";
  const done = sp.done === "1";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            {done ? "Unsubscribed" : "Unsubscribe from emails"}
          </CardTitle>
          <CardDescription>
            {done
              ? "You won't receive these emails anymore. You can re-enable them in Settings ▸ Notifications."
              : category === "all"
                ? "Stop all optional notification email from Sastra? In-app and push notifications will still appear."
                : `Stop receiving ${category} emails from Sastra? In-app and push notifications will still appear.`}
          </CardDescription>
        </CardHeader>
        {!done ? (
          <CardContent>
            <form action={submitUnsubscribe}>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="category" value={category} />
              <Button type="submit" variant="destructive" className="w-full">
                Unsubscribe
              </Button>
            </form>
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}

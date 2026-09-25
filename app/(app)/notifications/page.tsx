import { requireUser } from "@/lib/auth/guards";
import { listNotifications, notificationProject } from "@/lib/notifications/queries";
import { NotificationsList } from "@/components/notifications/notifications-list";
import { ContentColumn } from "@/components/cockpit";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const { user } = await requireUser();
  const items = await listNotifications(user.id, 50);
  return (
    <ContentColumn width="compact">
      <NotificationsList
        initial={items.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          project: notificationProject(n.data),
          link: n.link,
          readAt: n.readAt ? n.readAt.toISOString() : null,
          createdAt: n.createdAt.toISOString(),
        }))}
      />
    </ContentColumn>
  );
}

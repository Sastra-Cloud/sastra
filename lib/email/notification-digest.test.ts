import { describe, expect, it } from "vitest";

import {
  MAX_NOTIFICATION_EMAIL_ITEMS,
  notificationPreheader,
  renderNotificationEmail,
  type NotificationEmailItem,
} from "./notification-digest";

function item(
  index: number,
  overrides: Partial<NotificationEmailItem> = {}
): NotificationEmailItem {
  return {
    queueId: `q-${index}`,
    category: "workflow",
    type: "task_assigned",
    title: index === 1 ? "Review <script>alert(1)</script>" : `Update ${index}`,
    body: index === 1 ? "A & B" : `Body ${index}`,
    project: index % 2 === 0 ? "The Trinity" : null,
    link: `/projects/example/tasks?item=${index}&from=email`,
    createdAt: new Date(Date.UTC(2026, 6, 14, 10, index)),
    ...overrides,
  };
}

describe("notification digest rendering", () => {
  it("renders a single immediate update without redundant workflow headings", () => {
    const rendered = renderNotificationEmail({
      items: [item(1)],
      mode: "immediate",
      unsubscribeToken: "token value",
    });
    expect(rendered.subject).toBe("Review <script>alert(1)</script>");
    expect(rendered.html).toContain("Review &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(rendered.html).not.toContain("Review <script>");
    expect(rendered.html).not.toContain(">Workflow<");
    expect(rendered.html).toContain("View all notifications");
    expect(rendered.text).toContain(
      "http://localhost:3000/projects/example/tasks?item=1&from=email"
    );
    expect(rendered.unsubscribeCategory).toBe("workflow");
    expect(rendered.text).toContain("Stop workflow emails");
  });

  it("uses concise bundle and daily subjects", () => {
    const items = [item(1), item(2)];
    expect(renderNotificationEmail({ items, mode: "bundled", unsubscribeToken: "t" }).subject)
      .toBe("2 new Sastra updates");
    expect(renderNotificationEmail({ items, mode: "daily", unsubscribeToken: "t" }).subject)
      .toBe("Your Sastra digest: 2 updates");
  });

  it("summarizes notification types in the hidden preheader", () => {
    const items = [
      item(1, { type: "task_overdue" }),
      item(2, { type: "task_overdue" }),
      item(3, { type: "task_overdue" }),
      item(4),
      item(5),
      item(6, { category: "standup", type: "standup_digest" }),
    ];
    expect(notificationPreheader(items)).toBe(
      "3 overdue tasks · 2 assignments · 1 standup summary"
    );
    const rendered = renderNotificationEmail({
      items,
      mode: "bundled",
      unsubscribeToken: "token",
    });
    expect(rendered.preheader).toBe(
      "3 overdue tasks · 2 assignments · 1 standup summary"
    );
    expect(rendered.html).toContain("email-preheader");
  });

  it("organizes project groups newest-first, then Workspace and Standups", () => {
    const rendered = renderNotificationEmail({
      items: [
        item(1, { project: "Older Project" }),
        item(2, { project: null }),
        item(3, { project: "Newest Project" }),
        item(4, {
          category: "standup",
          type: "standup_digest",
          project: null,
          title: "Standup summary: Daily",
        }),
        item(5, { project: "Older Project", title: "Newest item in older project" }),
      ],
      mode: "bundled",
      unsubscribeToken: "token",
    });
    expect(rendered.html).not.toContain(">Workflow<");
    expect(rendered.html.indexOf("Older Project")).toBeLessThan(
      rendered.html.indexOf("Newest Project")
    );
    expect(rendered.html.indexOf("Newest Project")).toBeLessThan(
      rendered.html.indexOf(">Workspace<")
    );
    expect(rendered.html.indexOf(">Workspace<")).toBeLessThan(
      rendered.html.indexOf(">Standups<")
    );
    expect(rendered.html.indexOf("Newest item in older project")).toBeLessThan(
      rendered.html.indexOf("Review &lt;script&gt;")
    );
    expect(rendered.unsubscribeCategory).toBe("all");
    expect(rendered.text).toContain("Manage notification settings");
    expect(rendered.text).toContain("Stop notification emails");
  });

  it("keeps a standup-only bundle category-specific", () => {
    const rendered = renderNotificationEmail({
      items: [
        item(1, { category: "standup", type: "standup_digest" }),
        item(2, { category: "standup", type: "standup_digest" }),
      ],
      mode: "bundled",
      unsubscribeToken: "token",
    });
    expect(rendered.unsubscribeCategory).toBe("standup");
    expect(rendered.text).toContain("Stop standup emails");
  });

  it("limits detail to 50 newest items and summarizes the remainder", () => {
    const items = Array.from({ length: 55 }, (_, index) => item(index + 1));
    const rendered = renderNotificationEmail({
      items,
      mode: "daily",
      unsubscribeToken: "token",
    });
    expect(rendered.subject).toBe("Your Sastra digest: 55 updates");
    expect(rendered.detailedCount).toBe(MAX_NOTIFICATION_EMAIL_ITEMS);
    expect(rendered.remainder).toBe(5);
    expect(rendered.html).toContain("Plus 5 more");
    expect(rendered.html).toContain("Update 55");
    expect(rendered.html).not.toContain(">Update 2<");
  });
});

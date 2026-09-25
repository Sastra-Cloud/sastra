import { describe, expect, it } from "vitest";

import {
  compareProjectActivity,
  dedupeAndSortTeamChannels,
  selectProjectDestination,
} from "./sidebar-order";

describe("chat sidebar ordering", () => {
  it("keeps the active standalone channel when an empty duplicate exists", () => {
    const channels = dedupeAndSortTeamChannels([
      {
        id: "empty",
        name: "general",
        kind: "general",
        unread: 0,
        lastMessageAt: null,
      },
      {
        id: "active",
        name: "General",
        kind: "custom",
        unread: 0,
        lastMessageAt: "2026-07-25T10:00:00.000Z",
      },
    ]);

    expect(channels.map((channel) => channel.id)).toEqual(["active"]);
  });

  it("orders unread projects before read projects and then by activity", () => {
    const projects = [
      {
        projectTitle: "Read",
        pinned: false,
        pinnedAt: null,
        unread: 0,
        lastMessageAt: "2026-07-25T12:00:00.000Z",
      },
      {
        projectTitle: "Older unread",
        pinned: false,
        pinnedAt: null,
        unread: 2,
        lastMessageAt: "2026-07-24T12:00:00.000Z",
      },
      {
        projectTitle: "Newer unread",
        pinned: false,
        pinnedAt: null,
        unread: 1,
        lastMessageAt: "2026-07-25T11:00:00.000Z",
      },
    ].sort(compareProjectActivity);

    expect(projects.map((project) => project.projectTitle)).toEqual([
      "Newer unread",
      "Older unread",
      "Read",
    ]);
  });

  it("opens the newest unread channel before the last visited channel", () => {
    const destination = selectProjectDestination(
      [
        {
          id: "general",
          name: "General",
          unread: 0,
          lastMessageAt: "2026-07-25T12:00:00.000Z",
          lastVisitedAt: "2026-07-25T12:00:00.000Z",
        },
        {
          id: "translation",
          name: "Translation",
          unread: 3,
          lastMessageAt: "2026-07-25T13:00:00.000Z",
          lastVisitedAt: null,
        },
      ],
      (name) => (name.toLocaleLowerCase() === "general" ? 0 : 1)
    );

    expect(destination?.id).toBe("translation");
  });
});

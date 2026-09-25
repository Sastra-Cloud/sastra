import { describe, expect, it } from "vitest";

import {
  isMemberScopedChannel,
  updateChannelMembers,
  type ChannelMember,
} from "./channel-members";

const nathan: ChannelMember = {
  id: "nathan",
  name: "Nathan",
  image: null,
  role: "admin",
};
const bora: ChannelMember = {
  id: "bora",
  name: "Bora",
  image: null,
  role: "member",
};

describe("channel memberships", () => {
  it("restricts direct and custom channels without changing shared channels", () => {
    expect(isMemberScopedChannel("direct")).toBe(true);
    expect(isMemberScopedChannel("custom")).toBe(true);
    expect(isMemberScopedChannel("general")).toBe(false);
    expect(isMemberScopedChannel("project")).toBe(false);
    expect(isMemberScopedChannel("standup")).toBe(false);
  });

  it("adds members once in alphabetical order", () => {
    expect(
      updateChannelMembers([nathan], { type: "add", member: bora }).map(
        (member) => member.id
      )
    ).toEqual(["bora", "nathan"]);
    expect(
      updateChannelMembers([nathan], { type: "add", member: nathan })
    ).toEqual([nathan]);
  });

  it("removes only the selected member", () => {
    expect(
      updateChannelMembers([bora, nathan], {
        type: "remove",
        member: bora,
      })
    ).toEqual([nathan]);
  });
});

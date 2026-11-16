import { describe, expect, it } from "vitest";

import { findMentionedIds, hasChannelMention, tokenizeMentions, type MentionUser } from "./parse";

const nathan: MentionUser = {
  id: "u-nathan",
  name: "Nathan Wells",
  email: "nathan@example.com",
};
const bora: MentionUser = { id: "u-bora", name: "Bora", email: "bora@team.io" };
const nathanChan: MentionUser = {
  id: "u-nathan-2",
  name: "Nathan Chan",
  email: "nchan@example.com",
};
const roster = [nathan, bora, nathanChan];

describe("findMentionedIds", () => {
  it("matches a full multi-word display name", () => {
    expect(findMentionedIds("hey @Nathan Wells can you look?", roster)).toEqual([
      "u-nathan",
    ]);
  });

  it("matches a spaceless name and email local-part", () => {
    expect(findMentionedIds("@NathanWells + @nchan", roster).sort()).toEqual(
      ["u-nathan", "u-nathan-2"].sort()
    );
  });

  it("prefers the longest handle so a full name beats a shared first name", () => {
    // Both Nathans share the first name; the full name disambiguates.
    expect(findMentionedIds("@Nathan Chan hi", roster)).toEqual(["u-nathan-2"]);
  });

  it("does not treat an email address as a mention", () => {
    expect(findMentionedIds("write to nathan@example.com please", roster)).toEqual(
      []
    );
  });

  it("de-dupes repeated mentions of the same person", () => {
    expect(findMentionedIds("@Bora @Bora @bora", roster)).toEqual(["u-bora"]);
  });

  it("requires a boundary before the @ so mid-word @ is ignored", () => {
    expect(findMentionedIds("foo@Bora", roster)).toEqual([]);
  });

  it("matches when the mention is followed by punctuation", () => {
    expect(findMentionedIds("thanks @Bora!", roster)).toEqual(["u-bora"]);
  });
});

describe("tokenizeMentions", () => {
  it("splits text into text and mention segments", () => {
    expect(tokenizeMentions("hi @Bora ok", roster)).toEqual([
      { type: "text", text: "hi " },
      { type: "mention", text: "@Bora", user: bora },
      { type: "text", text: " ok" },
    ]);
  });
});

// An accidental broadcast interrupts the whole team; literal examples and
// partial handles must stay harmless while deliberate mentions still work.
it("recognizes deliberate channel alerts without broadcasting literals or partial handles", () => {
  for (const text of ["@channel Update", "Please review (@CHANNEL).", "Hi\n@channel!"]) {
    expect(hasChannelMention(text), text).toBe(true);
  }
  for (const text of [
    "me@channel.test", "@channels", "@channel_team", "@channel-team",
    "`@channel`", "```\n@channel\n```", "Use `@channel", "``literal ` @channel``",
    "https://example.org/@channel", "https://example.org/?@channel",
  ]) {
    expect(hasChannelMention(text), text).toBe(false);
  }
  expect(hasChannelMention("`@channel` then @channel please review")).toBe(true);
  expect(tokenizeMentions("@channel", roster)).toEqual([{ type: "text", text: "@channel" }]);
  expect(tokenizeMentions("@channel", roster, true)).toEqual([{ type: "channel", text: "@channel" }]);
  const channelNamedTeammate = { id: "channel-person", name: "Channel Smith" };
  expect(hasChannelMention("@Channel Smith please review", [channelNamedTeammate])).toBe(false);
  expect(findMentionedIds("@Channel Smith please review", [channelNamedTeammate])).toEqual(["channel-person"]);
});

import { describe, expect, it } from "vitest";

import {
  findMentionedIds,
  handlesFor,
  hasMention,
  tokenizeMentions,
  type MentionUser,
} from "./parse";

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

describe("handlesFor", () => {
  it("offers full name, spaceless name, first name, and email local-part", () => {
    expect(handlesFor(nathan)).toEqual([
      "Nathan Wells",
      "NathanWells",
      "Nathan",
      "nathan",
    ]);
  });

  it("de-dupes when the name is a single word", () => {
    expect(handlesFor(bora)).toEqual(["Bora", "bora"]);
  });
});

describe("findMentionedIds", () => {
  it("matches a full multi-word display name", () => {
    expect(findMentionedIds("hey @Nathan Wells can you look?", roster)).toEqual([
      "u-nathan",
    ]);
  });

  it("matches a bare first-name handle", () => {
    expect(findMentionedIds("@Bora ping", roster)).toEqual(["u-bora"]);
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

  it("returns nothing when there is no @ at all (fast path)", () => {
    expect(findMentionedIds("no mentions here", roster)).toEqual([]);
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

  it("keeps the exact typed handle text on the segment", () => {
    const segs = tokenizeMentions("@NathanWells hey", roster);
    expect(segs[0]).toEqual({
      type: "mention",
      text: "@NathanWells",
      user: nathan,
    });
  });

  it("returns a single text segment when nothing matches", () => {
    expect(tokenizeMentions("plain text", roster)).toEqual([
      { type: "text", text: "plain text" },
    ]);
  });

  it("handles an empty roster", () => {
    expect(tokenizeMentions("@Bora", [])).toEqual([{ type: "text", text: "@Bora" }]);
  });

  it("handles empty text", () => {
    expect(tokenizeMentions("", roster)).toEqual([]);
  });
});

describe("hasMention", () => {
  it("is true when someone is mentioned and false otherwise", () => {
    expect(hasMention("@Bora hi", roster)).toBe(true);
    expect(hasMention("hi", roster)).toBe(false);
  });
});

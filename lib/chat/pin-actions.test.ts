import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  return {
    requireUser: vi.fn(),
    canAccessMessage: vi.fn(),
    getMessagePin: vi.fn(),
    update,
    set,
    where,
  };
});

vi.mock("@/lib/auth/guards", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/chat/access", () => ({
  canAccessMessage: mocks.canAccessMessage,
}));
vi.mock("@/lib/chat/pins", () => ({ getMessagePin: mocks.getMessagePin }));
vi.mock("@/lib/db", () => ({ db: { update: mocks.update } }));

import { pinMessage, unpinMessage } from "./pin-actions";

const MESSAGE_ID = "01923f4e-7b2a-7c3d-8e4f-5a6b7c8d9e0f";
const SESSION_USER = "user-dara";

const savedPin = {
  messageId: MESSAGE_ID,
  authorId: "user-sokha",
  authorName: "Sokha",
  authorImage: null,
  excerpt: "Final cover is approved.",
  attachments: [],
  sentAt: "2026-09-20T02:00:00.000Z",
  pinnedAt: "2026-09-21T03:00:00.000Z",
  pinnedById: SESSION_USER,
  pinnedByName: "Dara",
  inRecentWindow: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ user: { id: SESSION_USER } });
  mocks.canAccessMessage.mockResolvedValue(true);
  mocks.getMessagePin.mockResolvedValue(savedPin);
});

describe("pinMessage", () => {
  it("checks access with the session user and records them as the pinner", async () => {
    const result = await pinMessage(MESSAGE_ID);

    expect(mocks.canAccessMessage).toHaveBeenCalledWith(
      MESSAGE_ID,
      SESSION_USER
    );
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        pinnedByUserId: SESSION_USER,
        pinnedAt: expect.any(Date),
      })
    );
    expect(result).toEqual({ ok: true, data: savedPin });
  });

  it("refuses people who cannot read the conversation without writing", async () => {
    mocks.canAccessMessage.mockResolvedValue(false);

    const result = await pinMessage(MESSAGE_ID);

    expect(result).toEqual({
      ok: false,
      error: { message: expect.stringContaining("could not find") },
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.getMessagePin).not.toHaveBeenCalled();
  });

  it("rejects ids that are not saved messages, such as pending sends", async () => {
    const result = await pinMessage(`pending-${MESSAGE_ID}`);

    expect(result.ok).toBe(false);
    expect(mocks.canAccessMessage).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("explains when the message was deleted", async () => {
    mocks.getMessagePin.mockResolvedValue(null);

    const result = await pinMessage(MESSAGE_ID);

    expect(result).toEqual({
      ok: false,
      error: { message: expect.stringContaining("deleted") },
    });
  });

  it("stops before any read or write when there is no session", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(pinMessage(MESSAGE_ID)).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.canAccessMessage).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("unpinMessage", () => {
  it("clears the pin for someone who can read the conversation", async () => {
    const result = await unpinMessage(MESSAGE_ID);

    expect(mocks.canAccessMessage).toHaveBeenCalledWith(
      MESSAGE_ID,
      SESSION_USER
    );
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({ pinnedAt: null, pinnedByUserId: null })
    );
    expect(result).toEqual({ ok: true, data: { messageId: MESSAGE_ID } });
  });

  it("refuses a teammate removed from a private channel", async () => {
    mocks.canAccessMessage.mockResolvedValue(false);

    const result = await unpinMessage(MESSAGE_ID);

    expect(result.ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { lectioConnections, lectioPairingIntents, user } from "@/lib/db/schema";
import { pairingProof } from "./pairing-proof";
import { digest } from "./protocol/signing";
const mocks = vi.hoisted(() => ({ select: vi.fn(), intent: {} as Record<string, unknown>, actor: { role: "admin", isActive: true }, connectionState: "pending" }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/crypto/secret-box", () => ({ openSecret: () => "private-verifier" }));
vi.mock("@/lib/workspace/module-guard", () => ({ requireWorkspaceModule: async () => ({ orgName: "Verified workspace" }) }));
vi.mock("./cloud-eligibility", () => ({ assertLectioCloudEligibility: async () => "instance-1" }));
beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_URL", "https://source.example");
  mocks.intent = { id: "pending-state", userId: "source-admin", origin: "https://lectio.example", verifier: "sealed", expiresAt: new Date(Date.now() + 60_000), completedAt: null, connectionId: null };
  mocks.actor = { role: "admin", isActive: true }; mocks.connectionState = "pending";
  mocks.select.mockReturnValue({ from: (table: unknown) => ({ where: async () => table === lectioPairingIntents ? [mocks.intent] : table === user ? [mocks.actor] : table === lectioConnections ? [{ state: mocks.connectionState }] : [] }) });
});
afterEach(() => vi.unstubAllEnvs());

it("attests the administrator's stored intent without disclosing its verifier or account", async () => {
  const proof = await pairingProof("pending-state");
  expect(proof).toMatchObject({ state: "pending-state", origin: "https://source.example", lectioOrigin: "https://lectio.example", instanceId: "instance-1", challenge: digest("private-verifier") });
  expect(proof).not.toHaveProperty("verifier"); expect(proof).not.toHaveProperty("userId");
});

it("withdraws proof when source authority, the setup intent or its connection is no longer valid", async () => {
  mocks.actor.isActive = false;
  await expect(pairingProof("pending-state")).rejects.toMatchObject({ status: 403 });
  mocks.actor = { role: "member", isActive: true };
  await expect(pairingProof("pending-state")).rejects.toMatchObject({ status: 403 });
  mocks.actor.role = "admin"; mocks.intent.completedAt = new Date();
  await expect(pairingProof("pending-state")).rejects.toMatchObject({ status: 403 });
  mocks.intent.completedAt = null; mocks.intent.expiresAt = new Date(0);
  await expect(pairingProof("pending-state")).rejects.toMatchObject({ status: 403 });
  mocks.intent.expiresAt = new Date(Date.now() + 60_000); mocks.intent.connectionId = "connection-1"; mocks.connectionState = "revoked";
  await expect(pairingProof("pending-state")).rejects.toMatchObject({ status: 403 });
});

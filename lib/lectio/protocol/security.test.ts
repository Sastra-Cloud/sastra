import { describe, expect, it } from "vitest";
import { dateOnly, IntegrationError, projectTaskState } from "./contract";
import { canonicalJson, signRequest, verifyRequest } from "./signing";
import { integrationOrigin, publicAddress } from "./transport";

const identity = { id: "connection-1", epoch: "epoch-1", keyId: "initial", secret: Buffer.alloc(32, 7).toString("base64url") };
const url = "https://lectio.example/api/integrations/sastra/v1/link";
const body = JSON.stringify({ projectId: "project-1" });
describe("integration authorization boundary", () => {
  it("binds mutations to connection, epoch, method, path, body and semantic operation", () => {
    const headers = signRequest(identity, "POST", url, body, "operation-1");
    const request = new Request(url, { method: "POST", headers, body });
    expect(verifyRequest(identity, request, Buffer.from(body)).operationId).toBe("operation-1");
    expect(() => verifyRequest({ ...identity, epoch: "revoked-epoch" }, request, Buffer.from(body))).toThrow(IntegrationError);
    expect(() => verifyRequest(identity, request, Buffer.from('{}'))).toThrow(IntegrationError);
    expect(() => verifyRequest(identity, new Request(url + "/other", { method: "POST", headers, body }), Buffer.from(body))).toThrow(IntegrationError);
    expect(() => verifyRequest(identity, new Request(url, { method: "POST", headers: { ...headers, "Idempotency-Key": "different" }, body }), Buffer.from(body))).toThrow(IntegrationError);
  });
  it("requires a fresh request signature for retries and rejects expired signatures", () => {
    const first = signRequest(identity, "POST", url, body, "same-operation");
    const retry = signRequest(identity, "POST", url, body, "same-operation");
    expect(first["X-Sastra-Request-Id"]).not.toBe(retry["X-Sastra-Request-Id"]);
    expect(first["Idempotency-Key"]).toBe(retry["Idempotency-Key"]);
    expect(() => verifyRequest(identity, new Request(url, { method: "POST", headers: first, body }), Buffer.from(body), Date.now() + 360_000)).toThrow(IntegrationError);
  });
  it("blocks local, metadata, mapped IPv6 and rebinding targets while allowing public peers", () => {
    for (const ip of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "100.64.1.1", "192.168.1.2", "::1", "::ffff:127.0.0.1", "fc00::1", "2002:7f00:1::"]) expect(publicAddress(ip)).toBe(false);
    expect(publicAddress("8.8.8.8")).toBe(true);
    expect(publicAddress("2606:4700:4700::1111")).toBe(true);
    expect(() => integrationOrigin("https://lectio.example/path")).toThrow(IntegrationError);
    expect(() => integrationOrigin("https://user:secret@lectio.example")).toThrow(IntegrationError);
    expect(integrationOrigin("https://lectio.example/")).toBe("https://lectio.example");
  });
});
it("never reports a partially completed grouped phase as done and validates calendar deadlines", () => {
  const step = { key: "one", state: "completed" as const, activatedAt: null, completedAt: "2026-10-23T10:00:00Z", assigneeIds: [] };
  expect(projectTaskState([step, { ...step, key: "two", state: "pending", completedAt: null }])).toBe("in_progress");
  expect(() => projectTaskState([])).toThrow(IntegrationError);
  expect(() => dateOnly("2026-02-30")).toThrow(IntegrationError);
  expect(() => dateOnly("2026-99-99")).toThrow(IntegrationError);
  expect(dateOnly("2028-02-29")).toBe("2028-02-29");
});

it("keeps semantic retry bytes stable across JSONB key ordering", () => {
  const first = canonicalJson({ projectId: "p", generation: 2, nested: { z: [3, 1], a: true } });
  const restored = canonicalJson({ nested: { a: true, z: [3, 1] }, generation: 2, projectId: "p" });
  expect(restored).toBe(first);
  expect(canonicalJson({ nested: { a: true, z: [1, 3] }, generation: 2, projectId: "p" })).not.toBe(first);
});

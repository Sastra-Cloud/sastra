import "server-only";
import { openSecret } from "@/lib/crypto/secret-box";
import type { LectioConnection } from "./endpoint";
import { canonicalJson, signRequest } from "./protocol/signing";
import { integrationJson } from "./protocol/transport";
import { assertLectioCloudEligibility } from "./cloud-eligibility";
export async function lectioRequest<T>(connection: LectioConnection, path: string, body?: unknown, operationId?: string) {
  await assertLectioCloudEligibility();
  const method = body === undefined ? "GET" : "POST", serialized = body === undefined ? "" : canonicalJson(body);
  return integrationJson<T>(connection.origin, path, { method, body: serialized || undefined,
    headers: signRequest({ id: connection.id, epoch: connection.epoch, keyId: connection.outgoingKeyId,
      secret: openSecret(connection.outgoingSecret) }, method, connection.origin + path, serialized, operationId) });
}

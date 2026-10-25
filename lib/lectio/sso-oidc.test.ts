import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as oidc from "openid-client";
import { sealSecret } from "@/lib/crypto/secret-box";
import { lectioOidcConfiguration, safeSsoReturnPath } from "./sso-oidc";
const request = vi.hoisted(() => vi.fn());
vi.mock("./protocol/transport", () => ({ integrationOrigin: (value: string) => value, integrationRequest: request }));
const issuer = "https://lectio.example/api/auth", clientId = "sastra-test";
const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const rogue = generateKeyPairSync("rsa", { modulusLength: 2048 });
let claims: Record<string, unknown>, signingKey = pair.privateKey, remoteJwks = `${issuer}/jwks`;
function token() {
  const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const data = `${encode({ alg: "RS256", kid: "test" })}.${encode(claims)}`;
  return `${data}.${sign("RSA-SHA256", Buffer.from(data), signingKey).toString("base64url")}`;
}
beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_SECRET", "test-only-identity-encryption-key-32chars");
  signingKey = pair.privateKey; remoteJwks = `${issuer}/jwks`;
  claims = { iss: issuer, aud: clientId, sub: "lectio-user", nonce: "expected-nonce", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 };
  request.mockImplementation(async (_origin: string, path: string) => ({ status: 200, retryAfter: null, body: Buffer.from(JSON.stringify(
    path.endsWith("openid-configuration") ? { issuer, authorization_endpoint: `${issuer}/oauth2/authorize`, token_endpoint: `${issuer}/oauth2/token`, jwks_uri: remoteJwks, id_token_signing_alg_values_supported: ["RS256"], authorization_response_iss_parameter_supported: true } :
    path.endsWith("jwks") ? { keys: [{ ...pair.publicKey.export({ format: "jwk" }), kid: "test", alg: "RS256", use: "sig" }] } :
    { token_type: "Bearer", access_token: "unused", expires_in: 300, id_token: token() }
  )) }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
async function exchange() {
  const config = await lectioOidcConfiguration({ issuer, clientId, secret: sealSecret("client-secret") });
  return oidc.authorizationCodeGrant(config, new URL(`https://sastra.example/api/auth/lectio/callback?code=code&state=expected-state&iss=${encodeURIComponent(issuer)}`), {
    expectedState: "expected-state", expectedNonce: "expected-nonce", pkceCodeVerifier: "verifier", idTokenExpected: true,
  });
}
describe("Lectio identity verification", () => {
  it("accepts a correctly signed, scoped token", async () => { expect((await exchange()).claims()?.sub).toBe("lectio-user"); });
  it.each(["nonce", "aud", "iss", "exp", "signature"])("rejects a forged or mismatched %s without issuing an identity", async field => {
    if (field === "signature") signingKey = rogue.privateKey;
    else claims[field] = field === "exp" ? 1 : "attacker";
    await expect(exchange()).rejects.toThrow();
  });
  it("rejects cross-origin JWKS before fetching it", async () => {
    remoteJwks = "http://169.254.169.254/latest";
    await expect(exchange()).rejects.toThrow("Unexpected identity endpoint");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("preserves relative destinations and rejects external or auth endpoints", () => {
    expect(safeSsoReturnPath("/projects/book/translation?document=chapter#review")).toBe("/projects/book/translation?document=chapter#review");
    for (const path of ["//evil.test", "/\\evil.test", "https://evil.test", "/api/auth/lectio/start", "/login?next=evil", "/\nevil"]) expect(safeSsoReturnPath(path)).toBe("/dashboard");
  });
});

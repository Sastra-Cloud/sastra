/**
 * Whether Sastra's database connection is encrypted. Pure so it is testable.
 *
 * Postgres reports TLS for the session it serves. Behind a transaction pooler
 * (Neon's `-pooler` endpoints, PgBouncer) that session is the pooler's own
 * connection inside the provider's network, so Postgres says "no TLS" even
 * when our connection to the pooler is encrypted. There we trust our side of
 * the connection, but only when it verifies the server's certificate.
 */
import { looksLikePooler } from "@/lib/db/config";

const VERIFYING_MODES = new Set(["verify-full", "verify-ca"]);

export function sslModeOf(connectionString: string | undefined): string | null {
  if (!connectionString) return null;
  try {
    return new URL(connectionString).searchParams.get("sslmode");
  } catch {
    return null;
  }
}

export function databaseTransportIsSecure(input: {
  serverReportsTls: boolean;
  connectionString: string | undefined;
}): boolean {
  if (input.serverReportsTls) return true;
  return looksLikePooler(input.connectionString) && VERIFYING_MODES.has(sslModeOf(input.connectionString) ?? "");
}

/** What an admin should do, without assuming a hosting provider. */
export const DATABASE_TLS_ADVICE =
  "Turn on SSL for the database, add sslmode=verify-full to DATABASE_URL, and restart Sastra.";

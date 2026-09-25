import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { aiUsageSettings } from "@/lib/db/schema";
import { openSecret, SecretBoxError } from "@/lib/crypto/secret-box";
import { isHostedInstance } from "@/lib/hosted/mode";

const SETTINGS_ID = "workspace";
const CACHE_TTL_MS = 60_000;

/** Where the effective OpenRouter key comes from. */
export type OpenRouterKeySource = "settings" | "env" | "none";

type ResolvedKey = {
  apiKey: string | null;
  source: OpenRouterKeySource;
  /** A key is stored but cannot be decrypted (encryption key changed?). */
  storedKeyUnreadable: boolean;
};

let cache: { at: number; value: ResolvedKey } | null = null;
let inflight: Promise<ResolvedKey> | null = null;

/** Drop the cached key so the next call re-reads the database (call after saves). */
export function invalidateOpenRouterApiKeyCache() {
  cache = null;
  inflight = null;
}

function envKey(): string | null {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  return key ? key : null;
}

async function loadResolvedKey(): Promise<ResolvedKey> {
  // Hosted workspaces run only on the plan's capped key; a stored key is never used.
  if (isHostedInstance()) {
    const fromEnv = envKey();
    return { apiKey: fromEnv, source: fromEnv ? "env" : "none", storedKeyUnreadable: false };
  }
  const [row] = await db
    .select({ sealed: aiUsageSettings.openrouterApiKeyEncrypted })
    .from(aiUsageSettings)
    .where(eq(aiUsageSettings.id, SETTINGS_ID))
    .limit(1);

  if (row?.sealed) {
    try {
      const apiKey = openSecret(row.sealed);
      if (apiKey) return { apiKey, source: "settings", storedKeyUnreadable: false };
    } catch (error) {
      // Do not take AI down because a stored key is unreadable; fall through
      // to the environment and surface the problem in Settings ▸ AI.
      console.error(
        "Stored OpenRouter key could not be read:",
        error instanceof SecretBoxError ? error.message : error
      );
      const fromEnv = envKey();
      return {
        apiKey: fromEnv,
        source: fromEnv ? "env" : "none",
        storedKeyUnreadable: true,
      };
    }
  }

  const fromEnv = envKey();
  return { apiKey: fromEnv, source: fromEnv ? "env" : "none", storedKeyUnreadable: false };
}

async function resolved(): Promise<ResolvedKey> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.value;
  if (!inflight) {
    inflight = loadResolvedKey()
      .then((value) => {
        cache = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * The OpenRouter key AI calls should use: the admin-entered key from
 * Settings ▸ AI when one is stored, otherwise `OPENROUTER_API_KEY`. Cached in
 * memory for a minute; `invalidateOpenRouterApiKeyCache()` after a save.
 */
export async function resolveOpenRouterApiKey(): Promise<string | null> {
  return (await resolved()).apiKey;
}

export type OpenRouterKeyStatus = {
  source: OpenRouterKeySource;
  /** Last four characters of the stored key; never the full key. */
  storedLast4: string | null;
  storedUpdatedAt: string | null;
  envConfigured: boolean;
  storedKeyUnreadable: boolean;
};

/** Safe-to-render summary for Settings ▸ AI. Never includes the key itself. */
export async function getOpenRouterApiKeyStatus(): Promise<OpenRouterKeyStatus> {
  const [row] = await db
    .select({
      sealed: aiUsageSettings.openrouterApiKeyEncrypted,
      updatedAt: aiUsageSettings.openrouterApiKeyUpdatedAt,
    })
    .from(aiUsageSettings)
    .where(eq(aiUsageSettings.id, SETTINGS_ID))
    .limit(1);
  const envConfigured = envKey() !== null;
  if (!row?.sealed) {
    return {
      source: envConfigured ? "env" : "none",
      storedLast4: null,
      storedUpdatedAt: null,
      envConfigured,
      storedKeyUnreadable: false,
    };
  }
  try {
    const apiKey = openSecret(row.sealed);
    return {
      source: "settings",
      storedLast4: apiKey.slice(-4),
      storedUpdatedAt: row.updatedAt?.toISOString() ?? null,
      envConfigured,
      storedKeyUnreadable: false,
    };
  } catch {
    return {
      source: envConfigured ? "env" : "none",
      storedLast4: null,
      storedUpdatedAt: row.updatedAt?.toISOString() ?? null,
      envConfigured,
      storedKeyUnreadable: true,
    };
  }
}

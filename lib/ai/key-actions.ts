"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/lib/actions/result";
import { invalidateOpenRouterApiKeyCache } from "@/lib/ai/keys";
import { requireCapability } from "@/lib/auth/guards";
import { sealSecret, secretBoxConfigured } from "@/lib/crypto/secret-box";
import { db } from "@/lib/db";
import { aiUsageSettings } from "@/lib/db/schema";
import { isHostedInstance } from "@/lib/hosted/mode";

const HOSTED_MESSAGE =
  "On Sastra Cloud, AI runs on your plan's credits. A separate AI key cannot be added.";

const SETTINGS_ID = "workspace";

/** OpenRouter keys look like `sk-or-v1-<hex>`; reject anything else before storing. */
const apiKeySchema = z
  .string()
  .trim()
  .min(1, "Enter the AI key.")
  .refine((value) => value.startsWith("sk-or-"), {
    message: "The AI key must start with sk-or-.",
  })
  .refine((value) => value.length >= 20 && !/\s/.test(value), {
    message: "That does not look like a full AI key. Copy it again from OpenRouter.",
  });

export type SavedOpenRouterKey = { last4: string; updatedAt: string };

/**
 * Store an admin-entered OpenRouter key, encrypted at rest. Progress-based on
 * the client (credential save); the key is never echoed back.
 */
export async function updateOpenRouterApiKey(input: {
  apiKey: string;
}): Promise<ActionResult<SavedOpenRouterKey>> {
  const { user } = await requireCapability("ai.configure");
  if (isHostedInstance()) return { ok: false, error: { message: HOSTED_MESSAGE } };
  const parsed = apiKeySchema.safeParse(input?.apiKey);
  if (!parsed.success) {
    return {
      ok: false,
      error: { message: parsed.error.issues[0]?.message ?? "Enter a valid AI key." },
    };
  }
  if (!secretBoxConfigured()) {
    return {
      ok: false,
      error: {
        message:
          "The server cannot encrypt the AI key. Ask the deployment owner to set APP_ENCRYPTION_KEY.",
      },
    };
  }
  const apiKey = parsed.data;
  const now = new Date();
  await db
    .insert(aiUsageSettings)
    .values({
      id: SETTINGS_ID,
      openrouterApiKeyEncrypted: sealSecret(apiKey),
      openrouterApiKeyUpdatedAt: now,
      openrouterApiKeyUpdatedBy: user.id,
      updatedBy: user.id,
    })
    .onConflictDoUpdate({
      target: aiUsageSettings.id,
      set: {
        openrouterApiKeyEncrypted: sealSecret(apiKey),
        openrouterApiKeyUpdatedAt: now,
        openrouterApiKeyUpdatedBy: user.id,
        updatedBy: user.id,
        updatedAt: now,
      },
    });
  invalidateOpenRouterApiKeyCache();
  revalidatePath("/settings/ai");
  return {
    ok: true,
    data: { last4: apiKey.slice(-4), updatedAt: now.toISOString() },
  };
}

/** Remove the stored key. AI falls back to `OPENROUTER_API_KEY` if that is set. */
export async function removeOpenRouterApiKey(): Promise<ActionResult> {
  const { user } = await requireCapability("ai.configure");
  if (isHostedInstance()) return { ok: false, error: { message: HOSTED_MESSAGE } };
  const now = new Date();
  await db
    .insert(aiUsageSettings)
    .values({
      id: SETTINGS_ID,
      openrouterApiKeyEncrypted: null,
      openrouterApiKeyUpdatedAt: now,
      openrouterApiKeyUpdatedBy: user.id,
      updatedBy: user.id,
    })
    .onConflictDoUpdate({
      target: aiUsageSettings.id,
      set: {
        openrouterApiKeyEncrypted: null,
        openrouterApiKeyUpdatedAt: now,
        openrouterApiKeyUpdatedBy: user.id,
        updatedBy: user.id,
        updatedAt: now,
      },
    });
  invalidateOpenRouterApiKeyCache();
  revalidatePath("/settings/ai");
  return { ok: true };
}

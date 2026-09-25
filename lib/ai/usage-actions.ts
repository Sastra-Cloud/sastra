"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCapability, requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { aiUsageSettings } from "@/lib/db/schema";
import { isHostedInstance } from "@/lib/hosted/mode";

const SETTINGS_ID = "workspace";

const usageSettingsSchema = z.object({
  workspaceAiMonthlyBudgetUsd: z.coerce.number().min(0).max(10_000).optional(),
  workspaceAiEnabled: z.boolean(),
  cloudflareMonthlyBudgetUsd: z.coerce.number().min(0).max(10_000),
  cloudflareEnabled: z.boolean(),
});

export async function updateAiUsageSettings(
  input: z.input<typeof usageSettingsSchema>
) {
  const { user } = await requireRole("admin");
  const data = usageSettingsSchema.parse(input);
  // On Sastra Cloud the workspace AI cap is set from the plan's credits by the
  // control plane (lib/hosted/entitlements.ts); an admin edit must not move it.
  const budget =
    isHostedInstance() || data.workspaceAiMonthlyBudgetUsd === undefined
      ? {}
      : { workspaceAiMonthlyBudgetUsd: data.workspaceAiMonthlyBudgetUsd };
  await db
    .insert(aiUsageSettings)
    .values({
      id: SETTINGS_ID,
      ...budget,
      workspaceAiEnabled: data.workspaceAiEnabled,
      cloudflareMonthlyBudgetUsd: data.cloudflareMonthlyBudgetUsd,
      cloudflareEnabled: data.cloudflareEnabled,
      updatedBy: user.id,
    })
    .onConflictDoUpdate({
      target: aiUsageSettings.id,
      set: {
        ...budget,
        workspaceAiEnabled: data.workspaceAiEnabled,
        cloudflareMonthlyBudgetUsd: data.cloudflareMonthlyBudgetUsd,
        cloudflareEnabled: data.cloudflareEnabled,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
  revalidatePath("/settings/costs");
}

/**
 * Turn the fast typed pre-judgment layer (TypeSafe Jev) on or off.
 *
 * Deliberately separate from {@link updateAiUsageSettings}: it is super-admin
 * only, and it writes just this column so saving budget limits can never
 * flip it, and flipping it can never reset a budget.
 */
export async function updateTypesafeEnabled(input: { enabled: boolean }) {
  const { user } = await requireCapability("ai.experimental");
  const { enabled } = z.object({ enabled: z.boolean() }).parse(input);
  await db
    .insert(aiUsageSettings)
    .values({
      id: SETTINGS_ID,
      typesafeEnabled: enabled,
      updatedBy: user.id,
    })
    .onConflictDoUpdate({
      target: aiUsageSettings.id,
      set: {
        typesafeEnabled: enabled,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
  revalidatePath("/settings/ai");
  revalidatePath("/settings/costs");
}

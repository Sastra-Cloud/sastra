"use server";

import { timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { count, eq } from "drizzle-orm";

import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import {
  createProvisioningGrant,
  isInitialAdminBootstrapEnabled,
  PROVISIONING_HEADER,
} from "@/lib/auth/provisioning";

export type BootstrapState = { error?: string };

/** Count of real (non-bot) users — used to gate the first-admin bootstrap. */
export async function countHumanUsers() {
  const [{ value }] = await db
    .select({ value: count() })
    .from(user)
    .where(eq(user.isBot, false));
  return value;
}

/**
 * First-run only: create the initial admin. Allowed exclusively when no human
 * user exists yet. Signs the new admin in (cookie set within the request scope).
 */
export async function bootstrapAdmin(
  _prev: BootstrapState,
  formData: FormData
): Promise<BootstrapState> {
  if (!isInitialAdminBootstrapEnabled()) {
    return { error: "Initial administrator setup is disabled." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const bootstrapToken = String(formData.get("bootstrapToken") ?? "");

  if (!name || !email) return { error: "Name and email are required." };
  if (password.length < 8)
    return { error: "Password must be at least 8 characters." };

  if ((await countHumanUsers()) > 0) {
    return { error: "An account already exists. Please sign in instead." };
  }

  if (process.env.NODE_ENV === "production") {
    const expectedEmail = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
    const expectedToken = process.env.INITIAL_ADMIN_TOKEN;
    const expectedBuf = Buffer.from(expectedToken ?? "", "utf8");
    const providedBuf = Buffer.from(bootstrapToken, "utf8");
    const tokenMatches =
      expectedBuf.length > 0 &&
      expectedBuf.length === providedBuf.length &&
      timingSafeEqual(expectedBuf, providedBuf);
    if (!expectedEmail || !expectedToken || email !== expectedEmail || !tokenMatches) {
      return { error: "The initial admin setup credentials are invalid." };
    }
  }

  try {
    const requestHeaders = new Headers(await headers());
    requestHeaders.set(
      PROVISIONING_HEADER,
      createProvisioningGrant(email, "bootstrap")
    );
    await auth.api.signUpEmail({
      body: { name, email, password },
      headers: requestHeaders,
    });
  } catch {
    return { error: "Could not create the account. Please try again." };
  }

  // The first user owns the highest workspace role. Later admins are invited.
  await db.update(user).set({ role: "super_admin" }).where(eq(user.email, email));

  redirect("/setup");
}

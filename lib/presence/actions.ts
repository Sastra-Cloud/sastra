"use server";

import { z } from "zod";

import { requireUser } from "@/lib/auth/guards";
import { setManualPresence } from "./queries";

const manualSchema = z.enum(["auto", "away", "offline"]);

/** Set the current user's manual presence override. */
export async function setPresenceStatus(status: z.infer<typeof manualSchema>) {
  const { user } = await requireUser();
  await setManualPresence(user.id, manualSchema.parse(status));
}

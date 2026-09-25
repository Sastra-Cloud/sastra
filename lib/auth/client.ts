"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
  plugins: [magicLinkClient(), passkeyClient()],
});

export const { signIn, signOut, signUp, useSession } = authClient;

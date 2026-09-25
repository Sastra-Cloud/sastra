import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { magicLink } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { passkey as passkeyPlugin } from "@better-auth/passkey";
import { and, count, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  account,
  passkey,
  rateLimit,
  session,
  user,
  verification,
} from "@/lib/db/schema/auth";
import { invitations, workspaceSettings } from "@/lib/db/schema/app";
import {
  ADMIN_ASSURANCE_COOKIE,
  adminAssuranceCookieOptions,
  createTrustedBrowserRecord,
  isAdminAssured,
} from "@/lib/auth/assurance";
import {
  isInitialAdminBootstrapEnabled,
  PROVISIONING_HEADER,
  verifyProvisioningGrant,
} from "@/lib/auth/provisioning";
import { assertSeatAvailable } from "@/lib/hosted/entitlements";
import { sendMagicLinkEmail } from "@/lib/email/magic-link";
import { sendPasswordResetEmail } from "@/lib/email/password-reset";
import { isAdminRole } from "@/lib/auth/policy";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/lib/auth/password-reset";

// Google is optional: only wired when creds are present, so login works without it.
// Requested with offline access so the Drive access token can be refreshed
// server-side; the drive.file scope is what the Drive Picker needs.
const googleProvider =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          accessType: "offline" as const,
          prompt: "consent" as const,
          scope: ["https://www.googleapis.com/auth/drive.file"],
          disableImplicitSignUp: true,
          disableSignUp: true,
        },
      }
    : undefined;

export const auth = betterAuth({
  appName: "Sastra",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification, passkey, rateLimit },
  }),
  socialProviders: googleProvider,
  account: {
    // Teammates sign in by email/magic-link, then link Google for Drive. Allow the
    // link even when the Google address differs from their app email.
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
      allowDifferentEmails: true,
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    // Invite-only team: emails are trusted via the invite, so no signup verification.
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail({ to: user.email, url });
    },
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "member",
        input: false, // assigned by admins/invites, never self-set
      },
      timezone: {
        type: "string",
        required: false,
        defaultValue: "UTC",
      },
      guidanceLevel: {
        type: "string",
        required: false,
        defaultValue: "on",
        input: false, // set through Profile settings, never at signup
      },
      isBot: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
      isActive: {
        type: "boolean",
        required: false,
        defaultValue: true,
        input: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh once/day
    freshAge: 60 * 60,
  },
  rateLimit: {
    enabled: process.env.NODE_ENV === "production",
    // Counters live in the `rate_limit` table so limits survive restarts and
    // scale-to-zero suspends, and apply across replicas.
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-up/email": { window: 60, max: 5 },
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-in/magic-link": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 5 },
      "/reset-password": { window: 60, max: 10 },
      "/passkey/*": { window: 60, max: 20 },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") {
        const email =
          typeof ctx.body?.email === "string" ? ctx.body.email : "";
        const grant = verifyProvisioningGrant(
          ctx.headers?.get(PROVISIONING_HEADER) ?? null,
          email
        );
        if (!grant) {
          throw new APIError("FORBIDDEN", {
            message: "Sign-ups are invite-only.",
          });
        }
        if (
          grant.purpose === "bootstrap" &&
          !isInitialAdminBootstrapEnabled()
        ) {
          throw new APIError("FORBIDDEN", {
            message: "Initial administrator setup is disabled.",
          });
        }
      }

      if (
        ctx.path === "/passkey/generate-register-options" ||
        ctx.path === "/passkey/verify-registration"
      ) {
        const active = await getSessionFromCtx(ctx);
        if (
          !active?.user.isActive ||
          !isAdminRole(active.user.role as string | undefined) ||
          !(await isAdminAssured(
            active.user.id,
            ctx.headers?.get("cookie") ?? null
          ))
        ) {
          throw new APIError("FORBIDDEN", {
            message: "Complete the security check before adding a passkey.",
          });
        }
      }

      if (
        ctx.path === "/passkey/delete-passkey" ||
        ctx.path === "/passkey/update-passkey"
      ) {
        const active = await getSessionFromCtx(ctx);
        if (
          active &&
          isAdminRole(active.user.role as string | undefined) &&
          !(await isAdminAssured(
            active.user.id,
            ctx.headers?.get("cookie") ?? null
          ))
        ) {
          throw new APIError("FORBIDDEN", {
            message: "Complete the security check before changing passkeys.",
          });
        }
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      const newSession = ctx.context.newSession;
      if (
        ctx.path === "/passkey/verify-authentication" &&
        newSession &&
        isAdminRole(newSession.user.role as string | undefined)
      ) {
        const trusted = await createTrustedBrowserRecord(
          newSession.user.id,
          "passkey"
        );
        ctx.setCookie(
          ADMIN_ASSURANCE_COOKIE,
          trusted.raw,
          adminAssuranceCookieOptions(trusted.expiresAt)
        );
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        // Invite-only: allow the very first admin (bootstrap), otherwise require
        // a valid pending invitation for the email. Sets role from the invite.
        before: async (newUser) => {
          const email = (newUser.email ?? "").toLowerCase();
          const [workspace] = await db
            .select({ timezone: workspaceSettings.timezone })
            .from(workspaceSettings)
            .where(eq(workspaceSettings.id, "workspace"))
            .limit(1);
          const withWorkspaceTimezone = {
            ...newUser,
            timezone: workspace?.timezone ?? "UTC",
          };
          const [{ value: humans }] = await db
            .select({ value: count() })
            .from(user)
            .where(eq(user.isBot, false));
          if (humans === 0 && isInitialAdminBootstrapEnabled()) {
            return { data: withWorkspaceTimezone };
          }

          const [invite] = await db
            .select()
            .from(invitations)
            .where(
              and(
                eq(invitations.email, email),
                isNull(invitations.acceptedAt),
                gt(invitations.expiresAt, new Date())
              )
            )
            .limit(1);
          if (!invite) {
            throw new APIError("FORBIDDEN", {
              message: "Sign-ups are invite-only.",
            });
          }
          // The invitation already holds this seat; the check only bites when
          // the plan shrank after it was sent.
          const seat = await assertSeatAvailable(1);
          if (!seat.ok) {
            throw new APIError("FORBIDDEN", { message: seat.error });
          }
          return { data: { ...withWorkspaceTimezone, role: invite.role } };
        },
        // Mark any pending invitations for this email as accepted.
        after: async (createdUser) => {
          const email = (createdUser.email ?? "").toLowerCase();
          await db
            .update(invitations)
            .set({ acceptedAt: new Date() })
            .where(
              and(
                eq(invitations.email, email),
                isNull(invitations.acceptedAt)
              )
            );
        },
      },
    },
  },
  plugins: [
    magicLink({
      expiresIn: 60 * 5,
      disableSignUp: true,
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail({ to: email, url });
      },
    }),
    passkeyPlugin({
      rpName: "Sastra",
      origin: process.env.BETTER_AUTH_URL,
      // The plugin's default freshness check only considers the primary
      // session creation time. Registration is instead gated above by an
      // active admin session plus Sastra's email-code/passkey assurance.
      registration: { requireSession: false },
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
    }),
    nextCookies(), // must be the last plugin
  ],
});

export type Session = typeof auth.$Infer.Session;

import "server-only";
import { createHash } from "node:crypto";
import * as oidc from "openid-client";
import { z } from "zod";
import { APIError, createAuthEndpoint, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { deleteSessionCookie, setSessionCookie } from "better-auth/cookies";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { lectioSsoSessions, lectioSsoIdentities } from "@/lib/db/schema";
import { sealSecret, openSecret } from "@/lib/crypto/secret-box";
import { activeSsoClient, checkSsoMembership, resolveSsoIdentity } from "@/lib/lectio/sso-service";
import { lectioOidcConfiguration, safeSsoReturnPath } from "@/lib/lectio/sso-oidc";
import { lockActiveConnection } from "@/lib/lectio/guard";
import { IntegrationError } from "@/lib/lectio/protocol/contract";

const stateHash = (state: string) => createHash("sha256").update(state).digest("hex");
type Flow = { connectionId: string; verifier: string; nonce: string; next: string; userId?: string; sessionId?: string };
type LinkReview = { connectionId: string; issuer: string; subject: string; userId: string; sessionId: string;
  next: string; person: { id: string; name: string | null; email: string } };

/** OIDC verification is delegated to pinned openid-client, not decoded JWT claims. */
export function lectioSharedSignIn() {
  return { id: "lectio-shared-sign-in", hooks: { before: [{
    matcher: (ctx: { path?: string }) => !ctx.path?.startsWith("/sign-in/") && !ctx.path?.startsWith("/callback/"),
    handler: createAuthMiddleware(async ctx => {
      const active = await getSessionFromCtx(ctx, { disableRefresh: true, disableCookieCache: true });
      if (!active) return;
      const [linked] = await db.select({ connectionId: lectioSsoSessions.connectionId, subject: lectioSsoIdentities.subject })
        .from(lectioSsoSessions).innerJoin(lectioSsoIdentities, eq(lectioSsoSessions.identityId, lectioSsoIdentities.id))
        .where(eq(lectioSsoSessions.sessionId, active.session.id));
      if (!linked) return;
      try { await checkSsoMembership(linked.connectionId, linked.subject); }
      catch {
        await ctx.context.internalAdapter.deleteSession(active.session.token);
        deleteSessionCookie(ctx);
        if (ctx.path === "/get-session") return ctx.json(null);
        throw new APIError("UNAUTHORIZED", { message: "Your shared sign-in session ended. Sign in again." });
      }
      // Shared sign-in sessions never silently extend beyond their short lifetime.
      if (ctx.path === "/get-session") return ctx.json(active);
    }),
  }] }, endpoints: {
    startLectioSignIn: createAuthEndpoint("/lectio/start", {
      method: "POST", body: z.object({ connectionId: z.string().max(160), mode: z.enum(["login", "link"]), next: z.string().max(2000).optional() }),
    }, async ctx => {
      try {
        const { client } = await activeSsoClient(ctx.body.connectionId);
        const active = await getSessionFromCtx(ctx);
        if (ctx.body.mode === "link" && (!active || Date.now() - active.session.createdAt.getTime() > 3600_000)) {
          throw new APIError("FORBIDDEN", { message: "Sign in to Sastra again before linking your accounts." });
        }
        if (ctx.body.mode === "link") {
          const [shared] = await db.select().from(lectioSsoSessions).where(eq(lectioSsoSessions.sessionId, active!.session.id));
          if (shared) throw new APIError("FORBIDDEN", { message: "Use your usual Sastra sign-in before linking an account." });
        }
        const config = await lectioOidcConfiguration(client);
        const state = oidc.randomState(), verifier = oidc.randomPKCECodeVerifier(), nonce = oidc.randomNonce();
        const flow: Flow = { connectionId: client.connectionId, verifier, nonce,
          next: safeSsoReturnPath(ctx.body.next, ctx.body.mode === "link" ? "/settings/profile" : "/dashboard"),
          ...(ctx.body.mode === "link" ? { userId: active!.user.id, sessionId: active!.session.id } : {}) };
        await ctx.context.internalAdapter.createVerificationValue({ identifier: `lectio-oidc:${stateHash(state)}`,
          value: sealSecret(JSON.stringify(flow)), expiresAt: new Date(Date.now() + 600_000) });
        const cookie = ctx.context.createAuthCookie("lectio_oidc", { maxAge: 600, sameSite: "lax" });
        await ctx.setSignedCookie(cookie.name, state, ctx.context.secret, cookie.attributes);
        const url = oidc.buildAuthorizationUrl(config, { scope: "openid", response_type: "code", state, nonce,
          redirect_uri: `${process.env.BETTER_AUTH_URL}/api/auth/lectio/callback`, code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: "S256" });
        return ctx.json({ url: url.href });
      } catch (error) {
        if (error instanceof APIError) throw error;
        throw new APIError("BAD_REQUEST", { message: "Shared sign-in is unavailable. Your usual Sastra sign-in still works." });
      }
    }),
    lectioSignInCallback: createAuthEndpoint("/lectio/callback", { method: "GET" }, async ctx => {
      const cookie = ctx.context.createAuthCookie("lectio_oidc", { maxAge: 600, sameSite: "lax" });
      try {
        const url = new URL(ctx.request!.url);
        const state = url.searchParams.get("state");
        const expectedState = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
        if (!state || !expectedState || state !== expectedState) throw new Error("Invalid state.");
        ctx.setCookie(cookie.name, "", { ...cookie.attributes, maxAge: 0 });
        const record = await ctx.context.internalAdapter.consumeVerificationValue(`lectio-oidc:${stateHash(state)}`);
        if (!record || record.expiresAt <= new Date()) throw new Error("Expired sign-in.");
        const flow = JSON.parse(openSecret(record.value)) as Flow;
        if (flow.userId) {
          const active = await getSessionFromCtx(ctx);
          if (!active || active.user.id !== flow.userId || active.session.id !== flow.sessionId) throw new Error("The linking session changed.");
        }
        const { client, connection } = await activeSsoClient(flow.connectionId);
        const config = await lectioOidcConfiguration(client);
        const tokens = await oidc.authorizationCodeGrant(config, url, { expectedState, expectedNonce: flow.nonce,
          pkceCodeVerifier: flow.verifier, idTokenExpected: true });
        const claims = tokens.claims();
        if (!claims || typeof claims.sub !== "string" || claims.iss !== client.issuer || claims.sastra_connection_id !== connection.id || claims.lectio_team_id !== connection.teamId) throw new Error("Wrong identity scope.");
        if (flow.userId) {
          const { membership } = await checkSsoMembership(connection.id, claims.sub);
          if (!membership.person || membership.person.id !== claims.sub || typeof membership.person.email !== "string") throw new Error("Update Lectio before linking accounts.");
          const token = oidc.randomState();
          const review: LinkReview = { connectionId: connection.id, issuer: claims.iss, subject: claims.sub,
            userId: flow.userId, sessionId: flow.sessionId!, next: flow.next, person: membership.person };
          await ctx.context.internalAdapter.createVerificationValue({ identifier: `lectio-link:${stateHash(token)}`,
            value: sealSecret(JSON.stringify(review)), expiresAt: new Date(Date.now() + 300_000) });
          const reviewCookie = ctx.context.createAuthCookie("lectio_link_review", { maxAge: 300, sameSite: "lax" });
          await ctx.setSignedCookie(reviewCookie.name, token, ctx.context.secret, reviewCookie.attributes);
          return ctx.redirect("/settings/profile/lectio-link");
        }
        const resolved = await resolveSsoIdentity({ connectionId: connection.id, issuer: claims.iss, subject: claims.sub });
        if (!flow.userId) {
          const newSession = await ctx.context.internalAdapter.createSession(resolved.user.id, false, { expiresAt: new Date(Date.now() + 15 * 60_000) });
          if (!newSession) throw new Error("Session could not be created.");
          try {
            await db.transaction(async tx => {
              await lockActiveConnection(tx, connection.id);
              await tx.insert(lectioSsoSessions).values({ sessionId: newSession.id, connectionId: connection.id, identityId: resolved.identity.id });
            });
            await setSessionCookie(ctx, { session: newSession, user: resolved.user });
          } catch (error) { await ctx.context.internalAdapter.deleteSession(newSession.token); throw error; }
        }
        return ctx.redirect(flow.next);
      } catch {
        ctx.setCookie(cookie.name, "", { ...cookie.attributes, maxAge: 0 });
        return ctx.redirect("/login?lectio=failed");
      }
    }),
    reviewLectioLink: createAuthEndpoint("/lectio/link-review", { method: "GET" }, async ctx => {
      ctx.setHeader("Cache-Control", "private, no-store");
      const active = await getSessionFromCtx(ctx);
      const cookie = ctx.context.createAuthCookie("lectio_link_review", { maxAge: 300, sameSite: "lax" });
      const token = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
      const record = token ? await ctx.context.internalAdapter.findVerificationValue(`lectio-link:${stateHash(token)}`) : null;
      if (!active || !record || record.expiresAt <= new Date()) throw new APIError("BAD_REQUEST", { message: "This account review expired. Start again from Profile settings." });
      const review = JSON.parse(openSecret(record.value)) as LinkReview;
      if (review.userId !== active.user.id || review.sessionId !== active.session.id) throw new APIError("FORBIDDEN", { message: "The Sastra linking session changed. Start again." });
      const { connection } = await checkSsoMembership(review.connectionId, review.subject);
      return ctx.json({ sastra: { name: active.user.name, email: active.user.email }, lectio: review.person, teamName: connection.teamName, origin: connection.origin });
    }),
    confirmLectioLink: createAuthEndpoint("/lectio/confirm-link", { method: "POST", body: z.object({ decision: z.enum(["confirm", "cancel", "switch"]) }) }, async ctx => {
      ctx.setHeader("Cache-Control", "private, no-store");
      const active = await getSessionFromCtx(ctx);
      const cookie = ctx.context.createAuthCookie("lectio_link_review", { maxAge: 300, sameSite: "lax" });
      const token = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
      if (!active || !token) throw new APIError("FORBIDDEN", { message: "Start account linking again from Profile settings." });
      const record = await ctx.context.internalAdapter.consumeVerificationValue(`lectio-link:${stateHash(token)}`);
      ctx.setCookie(cookie.name, "", { ...cookie.attributes, maxAge: 0 });
      if (!record || record.expiresAt <= new Date()) throw new APIError("BAD_REQUEST", { message: "This account review expired. Start again." });
      const review = JSON.parse(openSecret(record.value)) as LinkReview;
      if (review.userId !== active.user.id || review.sessionId !== active.session.id || Date.now() - active.session.createdAt.getTime() > 3600_000) throw new APIError("FORBIDDEN", { message: "Sign in to Sastra again before linking accounts." });
      const [shared] = await db.select().from(lectioSsoSessions).where(eq(lectioSsoSessions.sessionId, active.session.id));
      if (shared) throw new APIError("FORBIDDEN", { message: "Use your usual Sastra sign-in before linking an account." });
      if (ctx.body.decision !== "confirm") return ctx.json({ url: ctx.body.decision === "switch" ? `${new URL(review.issuer).origin}/dashboard` : "/settings/profile" });
      try {
        await resolveSsoIdentity({ connectionId: review.connectionId, issuer: review.issuer, subject: review.subject, linkUserId: active.user.id });
      } catch (error) { throw new APIError("BAD_REQUEST", { message: error instanceof IntegrationError ? error.message : "Could not link these accounts. Start again from Profile settings." }); }
      return ctx.json({ url: safeSsoReturnPath(review.next, "/settings/profile") });
    }),
    unlinkLectioSignIn: createAuthEndpoint("/lectio/unlink", { method: "POST" }, async ctx => {
      const active = await getSessionFromCtx(ctx);
      if (!active || Date.now() - active.session.createdAt.getTime() > 3600_000) throw new APIError("UNAUTHORIZED", { message: "Sign in again before unlinking Lectio." });
      // Do not remove a login method from inside the very session it authenticates.
      const [ssoSession] = await db.select().from(lectioSsoSessions).where(eq(lectioSsoSessions.sessionId, active.session.id));
      if (ssoSession) throw new APIError("FORBIDDEN", { message: "Use your usual Sastra sign-in before unlinking Lectio." });
      const { unlinkSsoIdentity } = await import("@/lib/lectio/sso-unlink");
      await unlinkSsoIdentity(active.user.id);
      return ctx.json({ saved: true });
    }),
  } };
}

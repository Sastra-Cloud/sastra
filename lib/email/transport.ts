import "server-only";

import { appHostname } from "@/lib/app-hostname";

import nodemailer from "nodemailer";

const port = Number(process.env.SMTP_PORT) || 587;

/**
 * Single shared Nodemailer transport (module-level singleton → connection pooling).
 * Provider-agnostic plain SMTP — switch providers by changing env vars only.
 * `secure` is derived from the port: 465 = implicit TLS, else STARTTLS.
 */
export const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port,
  secure: port === 465,
  // Fail fast on an unreachable/blocked SMTP host instead of hanging ~2 min on
  // the nodemailer defaults — the caller surfaces the error to the user.
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
  // Mailpit / local relays need no auth; only attach credentials when provided.
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
});

// Prefer sending through `sendMail()` in ./send, which picks the provider; this
// transport is the SMTP driver behind it.
export const from =
  process.env.EMAIL_FROM || process.env.SMTP_FROM || `Sastra <noreply@${appHostname()}>`;

/** App base URL — emails can't use relative links. */
export const appUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";

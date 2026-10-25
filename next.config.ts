import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD, PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const sharedConfig: NextConfig = {
  typescript: {
    // scripts/build.mjs sets this only after route generation and tsrs pass.
    ignoreBuildErrors: process.env.SASTRA_TSRS_CHECKED === "1",
  },
  // PDFKit loads font metrics relative to its installed package at runtime.
  serverExternalPackages: ["pdfkit"],
  // React's <ViewTransition> is on by default since Next 16.3; the former
  // experimental.viewTransition flag no longer exists.
  async headers() {
    // Never cache the service worker; authenticated content is network-only.
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://apis.google.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com https://*.googleusercontent.com https://*.gstatic.com",
              "font-src 'self' data:",
              "connect-src 'self' https://*.r2.cloudflarestorage.com https://*.ingest.sentry.io https://apis.google.com https://www.googleapis.com wss:",
              "media-src 'self' blob: https://*.r2.cloudflarestorage.com",
              "frame-src 'self' https://docs.google.com https://drive.google.com https://accounts.google.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com",
              "worker-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'",
              "upgrade-insecure-requests",
            ].join("; "),
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), geolocation=(), microphone=(self), payment=(), usb=()",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
      {
        source: "/wiki/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          {
            key: "Content-Security-Policy",
            value: "script-src 'self' 'unsafe-inline' https://apis.google.com; connect-src 'self' https://apis.google.com https://www.googleapis.com; frame-src 'self' https://docs.google.com https://drive.google.com https://accounts.google.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com; media-src 'self' blob: https://*.r2.cloudflarestorage.com; img-src 'self' data: blob: https://*.r2.cloudflarestorage.com https://*.googleusercontent.com https://*.gstatic.com; object-src 'none'; frame-ancestors 'self'; base-uri 'self'",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/donations",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, max-age=0, must-revalidate",
          },
        ],
      },
      {
        source: "/security-check",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, max-age=0, must-revalidate",
          },
        ],
      },
      {
        source: "/settings/security",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, max-age=0, must-revalidate",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default function nextConfig(phase: string): NextConfig {
  let deploymentId: string | undefined;
  if (phase === PHASE_PRODUCTION_BUILD) {
    deploymentId = process.env.NEXT_DEPLOYMENT_ID || randomUUID();
  } else if (phase !== PHASE_DEVELOPMENT_SERVER) {
    // Use the identity baked into this image, even when runtime env differs.
    // Next 16.3 uses a CONSTANT BUILD_ID when deploymentId is configured.
    try {
      deploymentId = JSON.parse(readFileSync(
        path.join(process.cwd(), ".next/required-server-files.json"), "utf8"
      )).config.deploymentId;
    } catch { /* No production build yet. */ }
  }
  return {
    ...sharedConfig,
    async headers() {
      const rules = await sharedConfig.headers?.() ?? [];
      if (phase !== PHASE_DEVELOPMENT_SERVER) return rules;
      // Next's development runtime uses eval for module execution and debugging.
      // Select by build phase so production never inherits this exception.
      return rules.map(rule => ({ ...rule, headers: rule.headers.map(header =>
        header.key.toLowerCase() === "content-security-policy"
          ? { ...header, value: header.value.replace(/script-src ([^;]+)/, "script-src $1 'unsafe-eval'") }
          : header) }));
    },
    deploymentId,
    env: { NEXT_PUBLIC_SASTRA_DEPLOYMENT_ID: deploymentId ?? "dev" },
  };
}

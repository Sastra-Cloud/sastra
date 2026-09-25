import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDFKit loads font metrics relative to its installed package at runtime.
  serverExternalPackages: ["pdfkit"],
  experimental: {
    viewTransition: true,
  },
  async headers() {
    // A stale service worker is the #1 cause of "stuck on an old version".
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

export default nextConfig;

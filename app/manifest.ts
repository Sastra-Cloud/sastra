import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sastra",
    short_name: "Sastra",
    description:
      "Tasks, chat, rights, budget, and AI-assisted planning for the Sastra team.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    // Match the light-theme viewport themeColor in app/layout.tsx so the PWA
    // splash/status chrome matches the app background (no dark manifest variant).
    background_color: "#fbfaf6",
    theme_color: "#fbfaf6",
    orientation: "portrait-primary",
    categories: ["productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

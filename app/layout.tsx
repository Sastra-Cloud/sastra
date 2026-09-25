import { AppDialogs } from "@/components/ui/app-dialogs";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { MotionProvider } from "@/components/motion/motion-provider";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { PwaProvider } from "@/components/pwa/pwa-provider";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

// Distinctive editorial display face for headings (publishing-house feel).
const fraunces = Fraunces({
  variable: "--font-heading",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Sastra",
    template: "%s · Sastra",
  },
  description:
    "Project & publishing workflow planner for the Sastra team — tasks, chat, rights, budget, and AI-assisted planning.",
  applicationName: "Sastra",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sastra",
  },
  icons: {
    // iOS Home Screen icon (opaque; iOS applies its own rounded-corner mask).
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf6" },
    { media: "(prefers-color-scheme: dark)", color: "#211831" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <MotionProvider>
            <PwaProvider>{children}</PwaProvider>
            <AppDialogs />
            <Toaster richColors position="top-right" />
            <ServiceWorkerRegister />
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

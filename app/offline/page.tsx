export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="font-heading text-2xl font-semibold">You&apos;re offline</h1>
      <p className="text-pretty text-muted-foreground">
        Sastra needs a connection. Reconnect and we&apos;ll pick up where
        you left off.
      </p>
    </main>
  );
}

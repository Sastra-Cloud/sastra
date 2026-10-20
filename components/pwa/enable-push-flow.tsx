"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BellOff,
  BellRing,
  Check,
  Download,
  Info,
  Monitor,
  RefreshCw,
  Share,
  Smartphone,
  SquarePlus,
} from "lucide-react";

import { usePushSetup, type UsePushSetup } from "@/hooks/use-push-setup";
import { usePwaInstall } from "@/components/pwa/pwa-provider";
import type { PushSetupState } from "@/lib/push/setup-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StaggerGroup, StaggerItem } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

type Variant = "card" | "settings";
type EnablePushFlowProps = {
  variant?: Variant;
  forceState?: PushSetupState;
};

/**
 * Guided, platform-aware flow for turning on push notifications. Reused by the
 * dashboard nudge (`variant="card"`) and the notification settings page
 * (`variant="settings"`). `forceState` is honored only in development so every
 * panel can be reviewed in the browser (real push/permissions can't be driven
 * by automation).
 */
export function EnablePushFlow({
  variant = "settings",
  forceState,
}: EnablePushFlowProps) {
  const setup = usePushSetup();
  const state =
    forceState && process.env.NODE_ENV !== "production" ? forceState : setup.state;

  return (
    <div className="space-y-3">
      <PushSetupPanel variant={variant} setup={setup} state={state} />
      {state !== "ready" ? <InstallAppButton /> : null}
    </div>
  );
}

function PushSetupPanel({
  variant,
  setup,
  state,
}: {
  variant: Variant;
  setup: UsePushSetup;
  state: PushSetupState;
}) {
  const router = useRouter();

  async function enable() {
    await setup.enable();
    router.refresh();
  }

  async function disable() {
    await setup.disable();
    router.refresh();
  }

  switch (state) {
    case "detecting":
      return variant === "settings" ? (
        <p className="text-xs text-muted-foreground">Checking this device…</p>
      ) : null;

    case "unsupported":
      return (
        <Note icon={Info} tone="muted">
          {setup.ios && setup.standalone
            ? "Update your iPhone or iPad to iOS 16.4 or later to receive notifications here."
            : "Notifications are unavailable here. Try an up-to-date Safari, Edge, or Chrome browser. If this continues, ask your admin to check notification setup."}
        </Note>
      );

    case "ios-needs-install":
      return variant === "card" ? (
        <IosCardPrompt />
      ) : (
        <div className="space-y-3">
          <Note icon={Smartphone} tone="primary">
            iPhone and iPad only send notifications from apps saved to the Home
            Screen. It takes a few seconds:
          </Note>
          <IosSteps />
        </div>
      );

    case "denied":
      return (
        <DeniedRecovery
          ios={setup.ios}
          macSafari={setup.macSafari}
          standalone={setup.standalone}
          onRecheck={setup.refresh}
        />
      );

    case "ready":
      return (
        <ReadyPanel
          busy={setup.busy}
          error={setup.error}
          onEnable={enable}
        />
      );

    case "enabled":
      return (
        <EnabledPanel
          variant={variant}
          busy={setup.busy}
          error={setup.error}
          onDisable={disable}
        />
      );

    default:
      return null;
  }
}

/* --- Shared pieces --------------------------------------------------------- */

/** Installation is available independently of notification permission/setup. */
function InstallAppButton() {
  const { canInstall, installed, macSafari, promptInstall } = usePwaInstall();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function install() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const outcome = await promptInstall();
      if (outcome === "accepted") {
        toast.success("Installation started. Open Sastra from your device's apps.");
      } else if (outcome === "unavailable") {
        toast.info("Open your browser's menu to install Sastra.");
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (installed) return null;
  if (macSafari) {
    return (
      <Dialog>
        <DialogTrigger render={<Button size="sm" variant="outline" />}>
          <Monitor /> Add to Dock
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Sastra to your Dock</DialogTitle>
            <DialogDescription>
              Open Sastra like a Mac app. Requires macOS Sonoma 14 or later.
            </DialogDescription>
          </DialogHeader>
          <ol className="list-decimal space-y-3 pl-5 text-sm text-pretty">
            <li>
              In Safari&apos;s menu bar, choose <strong>File</strong> →{" "}
              <strong>Add to Dock</strong>. You can also use Safari&apos;s{" "}
              <strong>Share</strong> menu.
            </li>
            <li>
              Keep the name <strong>Sastra</strong> and click <strong>Add</strong>.
            </li>
            <li>
              Open <strong>Sastra</strong> from the Dock. Sign in if asked.
            </li>
            <li>
              In the Dock app, open <strong>Settings → Notifications</strong>.
              Click <strong>Turn on notifications</strong>, then <strong>Allow</strong>.
            </li>
          </ol>
          <p className="text-xs text-muted-foreground text-pretty">
            Safari and the Dock app have separate notification settings. Allow
            notifications inside the Dock app to show its unread badge.
          </p>
        </DialogContent>
      </Dialog>
    );
  }
  if (!canInstall && !busy) return null;
  return (
    <Button size="sm" variant="outline" onClick={install} disabled={busy}>
      <Download /> {busy ? "Installing…" : "Install app"}
    </Button>
  );
}

function Note({
  icon: Icon,
  tone,
  children,
}: {
  icon: typeof Info;
  tone: "muted" | "primary";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 text-sm",
        tone === "primary" ? "text-foreground" : "text-muted-foreground"
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "primary" ? "text-primary" : "text-muted-foreground"
        )}
      />
      <p className="text-pretty">{children}</p>
    </div>
  );
}

function IosSteps() {
  const steps: { icon: typeof Share; text: ReactNode }[] = [
    {
      icon: Share,
      text: (
        <>
          Tap the <strong>Share</strong>{" "}icon in Safari&apos;s toolbar
          (bottom of the screen on iPhone, top on iPad).
        </>
      ),
    },
    {
      icon: SquarePlus,
      text: (
        <>
          Scroll down and choose <strong>Add to Home Screen</strong>, then{" "}
          <strong>Add</strong>.
        </>
      ),
    },
    {
      icon: Smartphone,
      text: (
        <>
          Open <strong>Sastra</strong> from your Home Screen and come back to this
          page to turn notifications on.
        </>
      ),
    },
  ];

  return (
    <StaggerGroup className="space-y-2.5" delayChildren={0.04}>
      {steps.map((step, i) => (
        <StaggerItem key={i}>
          <div className="flex items-start gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold tabular-nums text-primary">
              {i + 1}
            </span>
            <div className="flex min-w-0 flex-1 items-start gap-2 pt-0.5">
              <step.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p className="text-sm text-pretty">{step.text}</p>
            </div>
          </div>
        </StaggerItem>
      ))}
    </StaggerGroup>
  );
}

/** Compact iOS prompt for the dashboard nudge — full steps open in a dialog. */
function IosCardPrompt() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground text-pretty">
        On iPhone or iPad, add Sastra to your Home Screen to receive
        notifications.
      </p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={<Button size="sm" variant="outline" className="shrink-0" />}
        >
          Show me how
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Sastra to your Home Screen</DialogTitle>
            <DialogDescription>
              iPhone and iPad only send notifications from apps saved to the Home
              Screen.
            </DialogDescription>
          </DialogHeader>
          <IosSteps />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DeniedRecovery({
  ios,
  macSafari,
  standalone,
  onRecheck,
}: {
  ios: boolean;
  macSafari: boolean;
  standalone: boolean;
  onRecheck: () => void;
}) {
  return (
    <div className="space-y-3">
      <Note icon={BellOff} tone="muted">
        Notifications are blocked for Sastra on this device. To turn them back on:
      </Note>
      <ol className="ml-1 space-y-1.5 text-sm text-muted-foreground">
        {ios ? (
          <>
            <li>
              1. Open the iPhone <strong>Settings</strong> app →{" "}
              <strong>Notifications</strong> → <strong>Sastra</strong>.
            </li>
            <li>
              2. Turn on <strong>Allow Notifications</strong>, then return here.
            </li>
          </>
        ) : macSafari ? (
          <>
            <li>
              1. {standalone ? (
                <>
                  Open <strong>System Settings</strong> → <strong>Notifications</strong>{" "}
                  → <strong>Sastra</strong>. Turn on <strong>Allow notifications</strong>.
                </>
              ) : (
                <>
                  Open <strong>Safari</strong> → <strong>Settings</strong> →{" "}
                  <strong>Websites</strong> → <strong>Notifications</strong>.
                  Allow this site.
                </>
              )}
            </li>
            <li>
              2. Check <strong>System Settings → Notifications</strong> and{" "}
              <strong>Focus</strong> if alerts still do not appear. Then return here.
            </li>
          </>
        ) : (
          <>
            <li>
              1. Tap the <strong>lock</strong> (or tune) icon next to the address
              bar → <strong>Permissions</strong>.
            </li>
            <li>
              2. Allow <strong>Notifications</strong> for this site, then return
              here.
            </li>
          </>
        )}
      </ol>
      <Button size="sm" variant="outline" onClick={onRecheck}>
        <RefreshCw /> Check again
      </Button>
    </div>
  );
}

function ReadyPanel({
  busy,
  error,
  onEnable,
}: {
  busy: boolean;
  error: string | null;
  onEnable: () => void;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onEnable} disabled={busy}>
          <BellRing />
          {busy ? "Turning on…" : "Turn on notifications"}
        </Button>
        <InstallAppButton />
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function EnabledPanel({
  variant,
  busy,
  error,
  onDisable,
}: {
  variant: Variant;
  busy: boolean;
  error: string | null;
  onDisable: () => void;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Check className="size-3.5" />
          </span>
          Notifications are on for this device.
        </p>
        {variant === "settings" ? (
          <Button size="sm" variant="ghost" onClick={onDisable} disabled={busy}>
            {busy ? "…" : "Turn off"}
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

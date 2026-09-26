import {
  AlertTriangle,
  Clock3,
  Database,
  LoaderCircle,
  LockKeyhole,
  Shield,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DatabaseTransportSecurityStatus } from "@/lib/security/database-transport";
import type { DependencySecurityStatus } from "@/lib/security/dependency-monitor";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DependencySecurityCheckButton } from "@/components/settings/dependency-security-check-button";
import { DATABASE_TLS_ADVICE } from "@/lib/security/database-transport-rules";

const COPY = {
  healthy: {
    label: "Passed",
    title: "Security check passed",
    description: "Production dependencies passed the latest security audit.",
    icon: ShieldCheck,
    badge: "outline" as const,
    cardClassName: "bg-success/[0.035] ring-success/30",
    panelClassName: "bg-success/10 ring-success/25",
    iconClassName: "bg-success/15 text-success ring-success/25",
    badgeClassName:
      "border-success/30 bg-success/10 text-success dark:bg-success/15",
  },
  failed: {
    label: "Attention needed",
    title: "Security attention needed",
    description:
      "The latest audit found a high-severity production dependency advisory.",
    icon: AlertTriangle,
    badge: "destructive" as const,
    cardClassName: "",
    panelClassName: "bg-destructive/5 ring-destructive/20",
    iconClassName:
      "bg-destructive/10 text-destructive ring-destructive/20 dark:bg-destructive/15",
    badgeClassName: "",
  },
  stale: {
    label: "Overdue",
    title: "Security check overdue",
    description:
      "No dependency audit result has arrived within the last 36 hours.",
    icon: Clock3,
    badge: "destructive" as const,
    cardClassName: "",
    panelClassName: "bg-destructive/5 ring-destructive/20",
    iconClassName:
      "bg-destructive/10 text-destructive ring-destructive/20 dark:bg-destructive/15",
    badgeClassName: "",
  },
  awaiting: {
    label: "Awaiting first check",
    title: "Waiting for the first security check",
    description:
      "No audit result has been published for this version yet.",
    icon: Clock3,
    badge: "outline" as const,
    cardClassName: "",
    panelClassName: "bg-muted/30 ring-foreground/10",
    iconClassName: "bg-muted text-muted-foreground ring-foreground/10",
    badgeClassName: "",
  },
  running: {
    label: "Checking",
    title: "Security check running",
    description: "GitHub is auditing production dependencies now.",
    icon: LoaderCircle,
    badge: "outline" as const,
    cardClassName: "",
    panelClassName: "bg-primary/[0.06] ring-primary/20",
    iconClassName: "bg-primary/10 text-primary ring-primary/20",
    badgeClassName: "border-primary/25 bg-primary/10 text-primary",
  },
};

export function SecurityMonitorStatus({
  status,
  databaseStatus,
  checkConfigured,
}: {
  status: DependencySecurityStatus;
  databaseStatus: DatabaseTransportSecurityStatus;
  checkConfigured: boolean;
}) {
  const copy = COPY[status.state];
  const Icon = copy.icon;
  const databaseSecure = databaseStatus.state === "secure";
  const databaseDevelopment = databaseStatus.state === "development";

  return (
    <div className="grid gap-4">
      <Card className={copy.cardClassName}>
        <CardHeader className="grid-cols-[minmax(0,1fr)_auto] gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="size-4" />
              Dependency security
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Production packages are audited daily and the result for this
              version is published. Only active super admins receive failure or
              overdue alerts.
            </p>
          </div>
          <Badge className={copy.badgeClassName} variant={copy.badge}>
            {copy.label}
          </Badge>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "flex items-center gap-4 rounded-xl p-4 ring-1",
              copy.panelClassName
            )}
          >
            <div
              className={cn(
                "flex size-14 shrink-0 items-center justify-center rounded-full ring-1",
                copy.iconClassName
              )}
            >
              <Icon
                aria-hidden="true"
                className={cn("size-8", status.state === "running" && "animate-spin")}
                strokeWidth={1.75}
              />
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold text-balance">
                {copy.title}
              </p>
              <p className="mt-0.5 text-sm text-foreground/75">
                {copy.description}
              </p>
              <p className="mt-1.5 text-xs font-medium text-foreground/65">
                {status.checkedAt
                  ? status.state === "running"
                    ? `Started ${timeAgo(status.checkedAt)}`
                    : `Last checked ${timeAgo(status.checkedAt)}`
                  : "Results arrive with the daily published audit."}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-xs text-muted-foreground">
              {checkConfigured
                ? "Run a fresh signed audit after dependency updates. Source changes still require review and CI."
                : "Security checks are switched off for this installation (SECURITY_STATUS_URL=off)."}
            </p>
            <DependencySecurityCheckButton
              configured={checkConfigured}
              running={status.state === "running"}
            />
          </div>
        </CardContent>
      </Card>

      <Card
        className={
          databaseSecure ? "bg-success/[0.035] ring-success/30" : undefined
        }
      >
        <CardHeader className="grid-cols-[minmax(0,1fr)_auto] gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-4" />
              Database transport
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Sastra checks whether its live PostgreSQL connection is protected
              with TLS.
            </p>
          </div>
          <Badge
            variant={databaseDevelopment ? "outline" : databaseSecure ? "outline" : "destructive"}
            className={
              databaseSecure
                ? "border-success/30 bg-success/10 text-success dark:bg-success/15"
                : undefined
            }
          >
            {databaseDevelopment
              ? "Production only"
              : databaseSecure
                ? "Encrypted"
                : "Action required"}
          </Badge>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "flex items-center gap-4 rounded-xl p-4 ring-1",
              databaseDevelopment
                ? "bg-muted/30 ring-foreground/10"
                : databaseSecure
                  ? "bg-success/10 ring-success/25"
                  : "bg-destructive/5 ring-destructive/20"
            )}
          >
            <div
              className={cn(
                "flex size-14 shrink-0 items-center justify-center rounded-full ring-1",
                databaseDevelopment
                  ? "bg-muted text-muted-foreground ring-foreground/10"
                  : databaseSecure
                    ? "bg-success/15 text-success ring-success/25"
                    : "bg-destructive/10 text-destructive ring-destructive/20"
              )}
            >
              {databaseSecure ? (
                <LockKeyhole
                  aria-hidden="true"
                  className="size-8"
                  strokeWidth={1.75}
                />
              ) : (
                <AlertTriangle
                  aria-hidden="true"
                  className="size-8"
                  strokeWidth={1.75}
                />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold text-balance">
                {databaseDevelopment
                  ? "Checked on the production server"
                  : databaseSecure
                    ? "Database connection encrypted"
                    : "Database connection is not encrypted"}
              </p>
              <p className="mt-0.5 text-sm text-foreground/75">
                {databaseDevelopment
                  ? "The development database is excluded from this production transport check."
                  : databaseSecure
                    ? "TLS is active on the live Sastra-to-PostgreSQL connection."
                    : DATABASE_TLS_ADVICE}
              </p>
              <p className="mt-1.5 text-xs font-medium text-foreground/65">
                {databaseDevelopment
                  ? "The daily production monitor reports this status."
                  : `Verified ${timeAgo(databaseStatus.checkedAt)}`}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

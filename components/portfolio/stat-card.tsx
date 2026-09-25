import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** A compact KPI card: icon + label + big number + hint. Shared by Dashboard + Portfolio. */
export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon?: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "destructive" | "success" | "warning";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          {Icon ? <Icon className="size-4" /> : null}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            "text-3xl font-semibold tabular-nums",
            tone === "destructive" && "text-destructive",
            tone === "success" && "text-success",
            tone === "warning" && "text-warning"
          )}
        >
          {value}
        </p>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

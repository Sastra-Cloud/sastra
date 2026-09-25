import type { ReactNode } from "react";

import { Brand } from "@/components/brand";
import { SourceLink } from "@/components/source-link";
import { cleanVersion, sourceUrlFor } from "@/lib/ops/source-url";
import { runningVersion } from "@/lib/ops/version";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AuthCardShell({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
}) {
  const build = runningVersion();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="mb-6 text-center">
        <Brand className="text-2xl" iconClassName="size-9" />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      <div className="mt-6">
        <SourceLink href={sourceUrlFor(build)} version={cleanVersion(build.version)} />
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { useGuidance } from "@/components/guidance/guidance-provider";
import { NewProjectForm } from "@/components/projects/new-project-form";
import { NewProjectGuided } from "@/components/projects/new-project-guided";
import { Button } from "@/components/ui/button";

type Template = {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
};

type Props = {
  templates: Template[];
  defaultSourceLanguage: string | null;
  defaultTargetLanguage: string | null;
  defaultPlanTemplateKey: string | null;
};

/**
 * Chooses the guided step-by-step flow or the single-page expert form based on
 * the user's guidance preference, and lets either user cross over. Both paths
 * submit the same `createProject` action with the same fields.
 */
export function NewProjectEntry(props: Props) {
  const { enabled } = useGuidance();
  const [mode, setMode] = useState<"guided" | "form">(
    enabled ? "guided" : "form"
  );

  if (mode === "guided") {
    return <NewProjectGuided {...props} onUseForm={() => setMode("form")} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => setMode("guided")}
        >
          <Sparkles className="size-4" />
          Use guided setup
        </Button>
      </div>
      <NewProjectForm {...props} />
    </div>
  );
}

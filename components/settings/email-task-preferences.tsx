"use client";

import { useState, useTransition } from "react";
import { Brain, MailCheck } from "lucide-react";
import { toast } from "sonner";

import { updateEmailTaskPreferences } from "@/lib/email/task-suggestion-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function EmailTaskPreferences({
  suggestionsEnabled,
  learningEnabled,
}: {
  suggestionsEnabled: boolean;
  learningEnabled: boolean;
}) {
  const [values, setValues] = useState({ suggestionsEnabled, learningEnabled });
  const [pending, startTransition] = useTransition();

  function update(patch: Partial<typeof values>) {
    const previous = values;
    const next = { ...values, ...patch };
    setValues(next);
    startTransition(async () => {
      try {
        await updateEmailTaskPreferences(next);
      } catch (error) {
        setValues(previous);
        toast.error(error instanceof Error ? error.message : "Could not save email assistant settings.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MailCheck className="size-5 text-primary" /> Email assistant
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Let Sastra notice concrete next steps in captured email.
        </p>
      </CardHeader>
      <CardContent className="divide-y p-0">
        <PreferenceRow
          icon={<MailCheck className="size-4" />}
          label="Suggest tasks from email"
          description="Direct proof approvals and inferred forwarded-email work wait for your review; explicit requests can create a task."
          checked={values.suggestionsEnabled}
          disabled={pending}
          onChange={(checked) => update({ suggestionsEnabled: checked })}
        />
        <PreferenceRow
          icon={<Brain className="size-4" />}
          label="Learn from my task decisions"
          description="Use your accepts, edits, dismissals, and undos to propose personal preferences for approval."
          checked={values.learningEnabled}
          disabled={pending}
          onChange={(checked) => update({ learningEnabled: checked })}
        />
      </CardContent>
    </Card>
  );
}

function PreferenceRow({
  icon,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-20 cursor-pointer items-center gap-3 py-3 pl-4 pr-16 sm:px-6">
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
      <input
        type="checkbox"
        className="size-5 shrink-0"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

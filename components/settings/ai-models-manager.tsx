"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateTaskModel } from "@/lib/ai/model-actions";
import {
  MODEL_CATALOG,
  TASK_META,
  TIER_LABELS,
  TIER_ORDER,
  findModel,
  isVisionModel,
  priceHint,
  type ModelTier,
} from "@/lib/ai/model-catalog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Row = {
  taskKey: string;
  model: string;
  fallbackModels: string[] | null;
  temperature: number | null;
};

const CUSTOM = "__custom__";

function priceLabel(slug: string): string {
  const m = findModel(slug);
  if (!m) return slug;
  const fmt = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);
  return `${m.label} · ${fmt(m.inPrice)}/${fmt(m.outPrice)}`;
}

export function AiModelsManager({ rows }: { rows: Row[] }) {
  const ordered = [...rows].sort(
    (a, b) => (TASK_META[a.taskKey]?.order ?? 99) - (TASK_META[b.taskKey]?.order ?? 99)
  );
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Choose the OpenRouter model for each AI task. Prices are indicative $/1M tokens
        (input/output); actual spend is billed by OpenRouter. Set{" "}
        <code className="text-xs">OPENROUTER_API_KEY</code> in the environment to enable AI.
      </p>
      {ordered.map((r) => (
        <ModelRow key={r.taskKey} row={r} />
      ))}
    </div>
  );
}

function ModelRow({ row }: { row: Row }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [model, setModel] = useState(row.model);
  const [custom, setCustom] = useState(() => !findModel(row.model));
  const [fallback, setFallback] = useState((row.fallbackModels ?? []).join(", "));
  const [temp, setTemp] = useState(
    row.temperature != null ? String(row.temperature) : ""
  );

  const meta = TASK_META[row.taskKey];
  const recommended = meta?.recommended;
  const needsVision = meta?.requires === "vision";
  const visionWarning =
    needsVision && !custom && !isVisionModel(model)
      ? "This task reads PDFs — pick a vision-capable model."
      : needsVision && custom
        ? "This task reads PDFs — make sure the custom model is vision-capable."
        : null;

  const selectValue = custom ? CUSTOM : model;

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="space-y-0.5">
          <p className="font-medium">{meta?.label ?? row.taskKey}</p>
          {meta?.description ? (
            <p className="text-xs text-muted-foreground">{meta.description}</p>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label className="text-xs">Model</Label>
            <Select
              value={selectValue}
              onValueChange={(v: string | null) => {
                if (!v) return;
                if (v === CUSTOM) {
                  setCustom(true);
                } else {
                  setCustom(false);
                  setModel(v);
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v: string | null) =>
                    !v ? "Select a model" : v === CUSTOM ? "Custom model…" : priceLabel(v)
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TIER_ORDER.map((tier: ModelTier) => (
                  <SelectGroup key={tier}>
                    <SelectLabel>{TIER_LABELS[tier]}</SelectLabel>
                    {MODEL_CATALOG.filter((m) => m.tier === tier).map((m) => (
                      <SelectItem key={m.slug} value={m.slug}>
                        {priceLabel(m.slug)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
                <SelectGroup>
                  <SelectItem value={CUSTOM}>Custom model…</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            {custom ? (
              <Input
                className="mt-1"
                list="model-suggestions"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="provider/model slug"
              />
            ) : priceHint(model) ? (
              <p className="text-[11px] text-muted-foreground">{priceHint(model)}</p>
            ) : null}
          </div>

          <div className="grid gap-1">
            <Label className="text-xs">Temperature (optional)</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={temp}
              onChange={(e) => setTemp(e.target.value)}
              placeholder="default"
            />
          </div>
        </div>

        {visionWarning ? (
          <p className="text-xs text-warning-foreground">{visionWarning}</p>
        ) : null}

        {recommended && model !== recommended ? (
          <p className="text-xs text-muted-foreground">
            Recommended: <code className="text-[11px]">{recommended}</code>{" "}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => {
                setModel(recommended);
                setCustom(!findModel(recommended));
              }}
            >
              Use recommended
            </button>
          </p>
        ) : null}

        <div className="grid gap-1">
          <Label className="text-xs">Fallback models (comma-separated)</Label>
          <Input
            value={fallback}
            onChange={(e) => setFallback(e.target.value)}
            placeholder="optional, e.g. anthropic/claude-haiku-4.5"
          />
        </div>

        <datalist id="model-suggestions">
          {MODEL_CATALOG.map((m) => (
            <option key={m.slug} value={m.slug} />
          ))}
        </datalist>

        <Button
          size="sm"
          disabled={pending || !model.trim()}
          onClick={() =>
            start(async () => {
              await updateTaskModel(
                row.taskKey,
                model,
                fallback,
                temp === "" ? null : Number(temp)
              );
              toast.success("Model updated");
              router.refresh();
            })
          }
        >
          {pending ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}

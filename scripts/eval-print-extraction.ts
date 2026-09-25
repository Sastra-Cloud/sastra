/**
 * Live, opt-in eval of printer-quote extraction accuracy.
 *
 * NOT part of `pnpm test` (which stays offline). This makes REAL model calls, so
 * it needs OPENROUTER_API_KEY and costs a few cents per run. Run it before
 * changing the extraction prompt/model/schema to catch regressions.
 *
 *   pnpm eval            # print a field-by-field accuracy report + cost
 *   pnpm eval --strict   # additionally exit 1 if accuracy is below THRESHOLD
 *
 * It imports only pure modules (schema/prompt/normalizer) — never
 * lib/ai/openrouter.ts (server-only + DB) — and builds its own OpenRouter client
 * with the same request shape the app uses.
 *
 * PDF fixtures are UNTRACKED (real invoices — see .gitignore). Layout:
 *   printer-quotes/<name>.pdf          the source invoice/quote
 *   printer-quotes/golden/<name>.json  expected fields (a partial
 *                                       ParsedPrinterQuote — only listed fields
 *                                       are checked)
 * Email-text cases are committed in scripts/eval/email-text-cases.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import OpenAI from "openai";

import {
  normalizePrintQuoteExtract,
  PRINT_QUOTE_JSON_SCHEMA,
  PRINT_QUOTE_SYSTEM_PROMPT,
} from "../lib/print/extract-schema";
import type { ParsedPrinterQuote } from "../lib/print/parser";
import {
  PRINT_TEXT_QUOTE_JSON_SCHEMA,
  PRINT_TEXT_QUOTE_SYSTEM_PROMPT,
} from "../lib/print/text-extract-schema";
import { PROMPT_MANIFEST } from "../lib/ai/prompts";
import { EMAIL_TEXT_CASES } from "./eval/email-text-cases";

const THRESHOLD = 0.85;
const strict = process.argv.includes("--strict");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const quotesDir = path.join(repoRoot, "printer-quotes");
const goldenDir = path.join(quotesDir, "golden");

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.log("⏭  Skipping eval: OPENROUTER_API_KEY is not set.");
  process.exit(0);
}

const model = process.env.EVAL_MODEL ?? "anthropic/claude-sonnet-5";
const client = new OpenAI({
  apiKey,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { "X-Title": "Sastra Eval" },
});

let totalCost = 0;

type ChatCompletion = OpenAI.Chat.Completions.ChatCompletion;

function usageCost(completion: ChatCompletion): number {
  const u = completion.usage as { cost?: number } | undefined;
  return u?.cost ?? 0;
}

// OpenRouter accepts `file` content parts, `provider`, and `plugins` that aren't
// in the OpenAI SDK types — build a plain body and cast, as the app does.
type CreateParams = Parameters<typeof client.chat.completions.create>[0];

async function createCompletion(
  body: Record<string, unknown>
): Promise<ChatCompletion> {
  return client.chat.completions.create(
    body as unknown as CreateParams
  ) as unknown as Promise<ChatCompletion>;
}

async function extractPdf(buf: Buffer, filename: string): Promise<ParsedPrinterQuote> {
  const completion = await createCompletion({
    model,
    messages: [
      { role: "system", content: PRINT_QUOTE_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Extract the printer quote/invoice fields as JSON." },
          {
            type: "file",
            file: {
              filename,
              file_data: `data:application/pdf;base64,${buf.toString("base64")}`,
            },
          },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "print_quote_extraction",
        strict: true,
        schema: PRINT_QUOTE_JSON_SCHEMA,
      },
    },
    provider: { require_parameters: true },
    plugins: [{ id: "file-parser", pdf: { engine: "native" } }],
  });
  totalCost += usageCost(completion);
  return normalizePrintQuoteExtract(
    JSON.parse(completion.choices[0]?.message?.content ?? "{}")
  );
}

async function extractText(text: string): Promise<ParsedPrinterQuote[]> {
  const completion = await createCompletion({
    model,
    messages: [
      { role: "system", content: PRINT_TEXT_QUOTE_SYSTEM_PROMPT },
      { role: "user", content: text.slice(0, 20_000) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "print_text_quotes",
        strict: true,
        schema: PRINT_TEXT_QUOTE_JSON_SCHEMA,
      },
    },
    provider: { require_parameters: true },
  });
  totalCost += usageCost(completion);
  const raw = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
  const list = Array.isArray(raw.quotes) ? raw.quotes : [];
  return list.map(normalizePrintQuoteExtract);
}

type FieldResult = { field: string; expected: unknown; got: unknown; ok: boolean };

function compare(
  expected: Record<string, unknown>,
  got: Record<string, unknown> | undefined
): FieldResult[] {
  return Object.entries(expected)
    .filter(([, v]) => v !== undefined)
    .map(([field, exp]) => {
      const val = got?.[field];
      const ok =
        val != null &&
        String(val).trim().toLowerCase() === String(exp).trim().toLowerCase();
      return { field, expected: exp, got: val ?? null, ok };
    });
}

function printResults(label: string, results: FieldResult[]) {
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${label}  (${pass}/${results.length})`);
  for (const r of results) {
    const mark = r.ok ? "✓" : "✗";
    console.log(
      `  ${mark} ${r.field.padEnd(16)} expected=${String(r.expected)} got=${String(r.got)}`
    );
  }
  return results;
}

async function main() {
  const all: FieldResult[] = [];

  // Trace results to prompt versions (bump in lib/ai/prompts.ts on edits).
  const promptVersions = PROMPT_MANIFEST.filter((p) =>
    p.taskKey.startsWith("print_")
  )
    .map((p) => `${p.promptName}@v${p.version}`)
    .join(", ");
  console.log(`Prompts: ${promptVersions}`);

  // ── PDF cases (untracked fixtures) ────────────────────────────────────────
  const pdfs = fs.existsSync(quotesDir)
    ? fs.readdirSync(quotesDir).filter((f) => f.toLowerCase().endsWith(".pdf"))
    : [];
  if (!pdfs.length) {
    console.log(
      `\nℹ  No PDF fixtures in ${quotesDir} — skipping PDF cases. Add invoices + golden/<name>.json to eval them.`
    );
  }
  for (const pdf of pdfs) {
    const base = pdf.replace(/\.pdf$/i, "");
    const goldenPath = path.join(goldenDir, `${base}.json`);
    if (!fs.existsSync(goldenPath)) {
      console.log(`\n⚠  ${pdf}: no golden (${path.relative(repoRoot, goldenPath)}) — skipped`);
      continue;
    }
    const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8")) as Record<string, unknown>;
    try {
      const got = await extractPdf(fs.readFileSync(path.join(quotesDir, pdf)), pdf);
      all.push(...printResults(`PDF · ${pdf}`, compare(golden, got as unknown as Record<string, unknown>)));
    } catch (err) {
      console.log(`\n✗ PDF · ${pdf} — extraction error: ${(err as Error).message}`);
      all.push({ field: "(extraction)", expected: "ok", got: "error", ok: false });
    }
  }

  // ── Email-text cases (committed) ──────────────────────────────────────────
  for (const testCase of EMAIL_TEXT_CASES) {
    try {
      const quotes = await extractText(testCase.text);
      const results: FieldResult[] = [];
      for (const exp of testCase.expected) {
        const match =
          quotes.find((q) => q.quantityCps === exp.quantityCps) ??
          (testCase.expected.length === 1 ? quotes[0] : undefined);
        results.push(
          ...compare(
            exp as Record<string, unknown>,
            match as unknown as Record<string, unknown>
          )
        );
      }
      all.push(...printResults(`TEXT · ${testCase.name}`, results));
    } catch (err) {
      console.log(`\n✗ TEXT · ${testCase.name} — extraction error: ${(err as Error).message}`);
      all.push({ field: "(extraction)", expected: "ok", got: "error", ok: false });
    }
  }

  // ── Aggregate ─────────────────────────────────────────────────────────────
  const pass = all.filter((r) => r.ok).length;
  const accuracy = all.length ? pass / all.length : 0;
  console.log("\n────────────────────────────────────────");
  console.log(`Model:    ${model}`);
  console.log(`Fields:   ${pass}/${all.length} correct (${(accuracy * 100).toFixed(1)}%)`);
  console.log(`Cost:     $${totalCost.toFixed(4)}`);
  console.log("────────────────────────────────────────");

  if (strict && accuracy < THRESHOLD) {
    console.error(`\n✗ Accuracy ${(accuracy * 100).toFixed(1)}% is below the ${(THRESHOLD * 100).toFixed(0)}% threshold.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

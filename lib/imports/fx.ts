import type {
  ExtractedBudgetLine,
  ExtractedMouPayment,
  ExtractedProject,
  ImportExtraction,
} from "@/lib/imports/types";

export type FxRate = {
  from: string;
  to: "USD";
  rate: number;
  rateDate: string;
  provider: string;
};

export type FxRateLoader = (currency: string) => Promise<FxRate | null>;

const FRANKFURTER_API = "https://api.frankfurter.dev/v2";
const RATE_CACHE_SECONDS = 4 * 60 * 60;
const RATE_TIMEOUT_MS = 5_000;

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function appendNote(current: string | null, note: string): string {
  return current?.trim() ? `${current.trim()} ${note}` : note;
}

function money(value: number): string {
  return value.toFixed(2);
}

/** Fetch the latest available ECB reference rate through Frankfurter. */
export async function fetchUsdReferenceRate(
  currency: string
): Promise<FxRate | null> {
  const from = currency.trim().toUpperCase();
  if (!from || from === "USD") return null;
  const url = `${FRANKFURTER_API}/rate/${encodeURIComponent(from)}/USD?providers=ECB`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Currency-rate lookup timed out.")),
      RATE_TIMEOUT_MS
    );
  });

  try {
    const response = await Promise.race([
      fetch(url, {
        headers: { Accept: "application/json" },
        next: { revalidate: RATE_CACHE_SECONDS },
      }),
      timeout,
    ]);
    if (!response.ok) {
      throw new Error(`Currency-rate lookup failed (${response.status}).`);
    }
    const body = (await response.json()) as Record<string, unknown>;
    const rate = Number(body.rate);
    const date = typeof body.date === "string" ? body.date : "";
    if (
      body.base !== from ||
      body.quote !== "USD" ||
      !Number.isFinite(rate) ||
      rate <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
    ) {
      throw new Error("Currency-rate lookup returned invalid data.");
    }
    return {
      from,
      to: "USD",
      rate,
      rateDate: date,
      provider: "ECB via Frankfurter",
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function convertLine(line: ExtractedBudgetLine, fx: FxRate): ExtractedBudgetLine {
  const sourceUnitPrice = line.unitPrice;
  const sourceAmount = line.amount;
  const convertedUnitPrice =
    sourceUnitPrice == null ? null : roundMoney(sourceUnitPrice * fx.rate);
  const convertedAmount =
    sourceAmount == null ? null : roundMoney(sourceAmount * fx.rate);
  const sourceParts = [
    sourceUnitPrice == null
      ? null
      : `unit price ${fx.from} ${money(sourceUnitPrice)}`,
    sourceAmount == null ? null : `amount ${fx.from} ${money(sourceAmount)}`,
  ].filter(Boolean);
  const convertedParts = [
    convertedUnitPrice == null
      ? null
      : `unit price USD ${money(convertedUnitPrice)}`,
    convertedAmount == null ? null : `amount USD ${money(convertedAmount)}`,
  ].filter(Boolean);
  const note = `Initial FX conversion: ${sourceParts.join(", ")} → ${convertedParts.join(", ")} at 1 ${fx.from} = ${fx.rate} USD (${fx.provider}, ${fx.rateDate}).`;
  return {
    ...line,
    unitPrice: convertedUnitPrice,
    amount: convertedAmount,
    notes: appendNote(line.notes, note),
  };
}

function convertProject(project: ExtractedProject, fx: FxRate): ExtractedProject {
  return {
    ...project,
    currency: "USD",
    fxConversion: fx,
    totalAmount:
      project.totalAmount == null
        ? null
        : roundMoney(project.totalAmount * fx.rate),
    budgetLines: project.budgetLines.map((line) => convertLine(line, fx)),
  };
}

function convertPayment(
  payment: ExtractedMouPayment,
  fx: FxRate
): ExtractedMouPayment {
  if (payment.amount == null) return payment;
  const amount = roundMoney(payment.amount * fx.rate);
  return {
    ...payment,
    amount,
    notes: appendNote(
      payment.notes,
      `Initial FX conversion: ${fx.from} ${money(payment.amount)} → USD ${money(amount)} at 1 ${fx.from} = ${fx.rate} USD (${fx.provider}, ${fx.rateDate}).`
    ),
  };
}

/**
 * Convert non-USD import amounts using one locked daily reference rate per
 * source currency. A failed lookup leaves that currency untouched for review.
 */
export async function convertExtractionToUsd(
  extraction: ImportExtraction,
  loadRate: FxRateLoader = fetchUsdReferenceRate
): Promise<ImportExtraction> {
  const currencies = Array.from(
    new Set(
      extraction.projects
        .map((project) => project.currency?.trim().toUpperCase())
        .filter((currency): currency is string =>
          Boolean(currency && currency !== "USD")
        )
    )
  );
  if (currencies.length === 0) return extraction;

  const loaded = await Promise.all(
    currencies.map(async (currency) => {
      try {
        return [currency, await loadRate(currency)] as const;
      } catch (error) {
        console.error(`FX conversion failed for ${currency}:`, error);
        return [currency, null] as const;
      }
    })
  );
  const rates = new Map(loaded);
  const projects = extraction.projects.map((project) => {
    const currency = project.currency?.trim().toUpperCase() || "USD";
    const fx = rates.get(currency);
    return fx ? convertProject(project, fx) : project;
  });

  // Agreement-level totals and schedules have no separate currency field. Only
  // convert them when every source project used the same foreign currency.
  const rootFx = currencies.length === 1 ? rates.get(currencies[0]) : null;
  return {
    ...extraction,
    projects,
    agreementTotalAmount:
      rootFx && extraction.agreementTotalAmount != null
        ? roundMoney(extraction.agreementTotalAmount * rootFx.rate)
        : extraction.agreementTotalAmount,
    mouPaymentSchedule: rootFx
      ? extraction.mouPaymentSchedule.map((payment) =>
          convertPayment(payment, rootFx)
        )
      : extraction.mouPaymentSchedule,
  };
}

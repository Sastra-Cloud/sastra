type UnknownRecord = Record<string, unknown>;

export type AiErrorDiagnostic = {
  status: number | null;
  errorType: string | null;
  providerCode: string | null;
  provider: string | null;
  requestId: string | null;
  generationId: string | null;
  providerMessage: string | null;
};

export type DescribedAiError = {
  userMessage: string;
  diagnostic: AiErrorDiagnostic;
};

const GENERIC_PROVIDER_MESSAGES = new Set([
  "provider returned error",
  "provider returned an error",
  "bad request",
  "request failed",
]);

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Keep useful provider detail while stripping credentials and document payloads. */
function safeProviderMessage(value: unknown): string | null {
  const raw = stringValue(value);
  if (!raw) return null;
  const clean = raw
    .replace(/data:[^;,\s]+;base64,[A-Za-z0-9+/=_-]+/gi, "[document data]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[redacted key]")
    .replace(/[A-Za-z0-9+/=_-]{100,}/g, "[redacted data]")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return null;
  return clean.length > 320 ? `${clean.slice(0, 317)}…` : clean;
}

function parseRawProviderError(raw: unknown): UnknownRecord | null {
  if (typeof raw === "object" && raw !== null) return asRecord(raw);
  if (typeof raw !== "string") return null;
  try {
    return asRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

function nestedProviderError(raw: UnknownRecord | null): UnknownRecord | null {
  if (!raw) return null;
  return asRecord(raw.error) ?? raw;
}

function headerValue(headers: unknown, name: string): string | null {
  const record = asRecord(headers);
  const get = record?.get;
  if (typeof get === "function") {
    try {
      return stringValue(get.call(headers, name));
    } catch {
      return null;
    }
  }
  return record ? stringValue(record[name] ?? record[name.toLowerCase()]) : null;
}

function normalizeErrorType(value: string | null): string | null {
  if (!value) return null;
  if (value === "invalid_request_error") return "invalid_request";
  if (value === "permission_error") return "permission_denied";
  if (value === "overloaded_error") return "provider_overloaded";
  return value;
}

function baseMessage(status: number | null, errorType: string | null): string {
  switch (errorType) {
    case "context_length_exceeded":
      return "This document is too large for the selected AI model's context window.";
    case "max_tokens_exceeded":
      return "The extracted result was too large for the selected AI model's output limit.";
    case "token_limit_exceeded":
      return "The AI provider's token allowance was exceeded.";
    case "string_too_long":
      return "A document or request field exceeded the AI provider's size limit.";
    case "payload_too_large":
      return "The document request exceeded the AI provider's upload limit.";
    case "invalid_request":
      return "The AI provider rejected the document extraction request.";
    case "invalid_prompt":
      return "The AI provider could not process this document or extraction prompt.";
    case "content_policy_violation":
      return "The AI provider's safety filter rejected the document or generated result.";
    case "refusal":
      return "The selected AI model refused to process this document.";
    case "invalid_image":
    case "unsupported_image_format":
    case "invalid_file":
      return "The AI provider could not read this document format.";
    case "image_too_large":
    case "file_too_large":
      return "The document is too large for the selected AI provider.";
    case "authentication":
      return "The AI provider credentials are missing, invalid, or expired.";
    case "permission_denied":
      return "The AI provider account is not allowed to use the selected model or feature.";
    case "payment_required":
      return "The AI provider account does not have enough credit for this extraction.";
    case "rate_limit_exceeded":
      return "The AI provider is rate-limiting requests. Retry in a moment.";
    case "provider_overloaded":
    case "provider_unavailable":
      return "The selected AI provider is temporarily unavailable. Retry in a moment.";
    case "timeout":
      return "The AI provider timed out while reading this document.";
  }

  switch (status) {
    case 400:
      return "The AI provider rejected the document extraction request.";
    case 401:
      return "The AI provider credentials are missing, invalid, or expired.";
    case 402:
      return "The AI provider account does not have enough credit for this extraction.";
    case 403:
      return "The AI provider account is not allowed to process this request.";
    case 404:
      return "The configured AI model or provider endpoint could not be found.";
    case 408:
    case 504:
      return "The AI provider timed out while reading this document.";
    case 413:
      return "The document request exceeded the AI provider's upload limit.";
    case 429:
      return "The AI provider is rate-limiting requests. Retry in a moment.";
    case 500:
    case 502:
    case 503:
      return "The selected AI provider is temporarily unavailable. Retry in a moment.";
    default:
      return "The AI provider could not extract this document.";
  }
}

/**
 * Convert OpenAI/OpenRouter SDK errors into a manager-safe explanation plus a
 * compact diagnostic object for server logs. Raw document data is never kept.
 */
export function describeAiError(error: unknown): DescribedAiError {
  const top = asRecord(error);
  const apiError = asRecord(top?.error);
  const metadata = asRecord(apiError?.metadata) ?? asRecord(top?.metadata);
  const raw = nestedProviderError(parseRawProviderError(metadata?.raw));

  const status =
    numberValue(top?.status) ??
    numberValue(top?.statusCode) ??
    numberValue(apiError?.code);
  const errorType = normalizeErrorType(
    stringValue(metadata?.error_type) ??
      stringValue(apiError?.type) ??
      stringValue(raw?.type)
  );
  const providerCode =
    stringValue(metadata?.provider_code) ??
    stringValue(raw?.code) ??
    (stringValue(raw?.type) !== errorType ? stringValue(raw?.type) : null);
  const provider =
    stringValue(metadata?.provider_name) ?? stringValue(metadata?.provider);
  const providerMessage =
    safeProviderMessage(raw?.message) ??
    safeProviderMessage(metadata?.message) ??
    safeProviderMessage(apiError?.message);
  const requestId =
    stringValue(top?.requestID) ??
    stringValue(raw?.request_id) ??
    headerValue(top?.headers, "x-request-id");
  const generationId = headerValue(top?.headers, "x-generation-id");

  // Non-provider failures retain their already-actionable message.
  if (status === null && !errorType) {
    const name = stringValue(top?.name);
    const ordinaryMessage = safeProviderMessage(top?.message);
    let userMessage: string;
    if (name === "SyntaxError") {
      userMessage =
        "The AI provider returned malformed structured data. Retry the parse.";
    } else if (name === "ZodError") {
      userMessage =
        "The AI provider returned data that did not match the import format. Retry the parse.";
    } else {
      userMessage = ordinaryMessage ?? "Document parsing failed unexpectedly.";
    }
    return {
      userMessage,
      diagnostic: {
        status: null,
        errorType: null,
        providerCode: null,
        provider: null,
        requestId: null,
        generationId: null,
        providerMessage: ordinaryMessage,
      },
    };
  }

  let userMessage = baseMessage(status, errorType);
  if (
    providerMessage &&
    !GENERIC_PROVIDER_MESSAGES.has(providerMessage.toLowerCase()) &&
    !userMessage.toLowerCase().includes(providerMessage.toLowerCase())
  ) {
    userMessage += ` Provider detail: ${providerMessage}`;
  }
  const reference = generationId ?? requestId;
  if (reference) userMessage += ` Reference: ${reference}.`;

  return {
    userMessage,
    diagnostic: {
      status,
      errorType,
      providerCode,
      provider,
      requestId,
      generationId,
      providerMessage,
    },
  };
}

import { describe, expect, it } from "vitest";

import { describeAiError } from "./error-details";

describe("describeAiError", () => {
  it("surfaces a useful nested provider message and reference", () => {
    const headers = new Headers({ "x-generation-id": "gen-test-123" });
    const result = describeAiError({
      status: 400,
      headers,
      error: {
        code: 400,
        message: "Provider returned error",
        metadata: {
          provider_name: "Anthropic",
          error_type: "invalid_request",
          provider_code: "invalid_request_error",
          raw: JSON.stringify({
            type: "error",
            error: {
              type: "invalid_request_error",
              message: "Too many parameters with union types in the schema.",
            },
          }),
        },
      },
    });

    expect(result.userMessage).toContain(
      "The AI provider rejected the document extraction request."
    );
    expect(result.userMessage).toContain(
      "Provider detail: Too many parameters with union types in the schema."
    );
    expect(result.userMessage).toContain("Reference: gen-test-123.");
    expect(result.diagnostic).toMatchObject({
      status: 400,
      errorType: "invalid_request",
      providerCode: "invalid_request_error",
      provider: "Anthropic",
      generationId: "gen-test-123",
    });
  });

  it("maps context and policy failures to manager-friendly messages", () => {
    expect(
      describeAiError({
        status: 400,
        error: { metadata: { error_type: "context_length_exceeded" } },
      }).userMessage
    ).toBe(
      "This document is too large for the selected AI model's context window."
    );
    expect(
      describeAiError({
        status: 400,
        error: { metadata: { error_type: "content_policy_violation" } },
      }).userMessage
    ).toBe(
      "The AI provider's safety filter rejected the document or generated result."
    );
  });

  it("explains account and availability failures", () => {
    expect(describeAiError({ status: 402 }).userMessage).toContain(
      "does not have enough credit"
    );
    expect(describeAiError({ status: 503 }).userMessage).toContain(
      "temporarily unavailable"
    );
  });

  it("does not repeat the generic provider message", () => {
    const result = describeAiError({
      status: 400,
      error: { message: "Provider returned error" },
    });
    expect(result.userMessage).toBe(
      "The AI provider rejected the document extraction request."
    );
  });

  it("redacts document data and credentials from provider detail", () => {
    const result = describeAiError({
      status: 400,
      error: {
        metadata: {
          error_type: "invalid_request",
          raw: JSON.stringify({
            error: {
              message:
                "Invalid file data: data:application/pdf;base64,AAAA and Bearer secret-token",
            },
          }),
        },
      },
    });
    expect(result.userMessage).toContain("[document data]");
    expect(result.userMessage).toContain("Bearer [redacted]");
    expect(result.userMessage).not.toContain("secret-token");
  });

  it("retains actionable non-provider errors", () => {
    expect(
      describeAiError(new Error("Could not download the document from storage."))
        .userMessage
    ).toBe("Could not download the document from storage.");
  });
});

import { describe, expect, it } from "vitest";

import { createEmptyDocument } from "../domain/document";
import { DocumentResultSchema, IPC_CHANNELS, parseDocumentResult } from "./contract";

describe("IPC contract", () => {
  it("names every channel within the kopper namespace", () => {
    expect(
      Object.values(IPC_CHANNELS).every((value) => value.startsWith("kopper:")),
    ).toBe(true);
  });

  it("rejects malformed document result envelopes", () => {
    expect(() => DocumentResultSchema.parse({ ok: true })).toThrow();
    expect(() =>
      parseDocumentResult({
        ok: false,
        error: {
          code: "not_a_kopper_error",
          message: "Unknown error",
          retryable: false,
        },
      }),
    ).toThrow();
  });

  it("parses success and error document result envelopes", () => {
    const document = createEmptyDocument(new Date("2026-08-16T12:00:00.000Z"));
    const error = {
      code: "read_failed" as const,
      message: "Could not read the store.",
      retryable: true,
      recoveryAction: "retry" as const,
    };

    expect(parseDocumentResult({ ok: true, value: document })).toEqual({
      ok: true,
      value: document,
    });
    expect(parseDocumentResult({ ok: false, error })).toEqual({
      ok: false,
      error,
    });
  });
});

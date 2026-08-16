import { describe, expect, expectTypeOf, it } from "vitest";

import type { DocumentCommand } from "../domain/commands";
import { createEmptyDocument } from "../domain/document";
import {
  ClipboardCopyResultSchema,
  CopyNotesArgumentsSchema,
  DocumentResultSchema,
  IPC_CHANNELS,
  parseClipboardCopyResult,
  parseDocumentResult,
  type KopperApi,
} from "./contract";

describe("IPC contract", () => {
  it("names every channel within the kopper namespace", () => {
    expect(
      Object.values(IPC_CHANNELS).every((value) => value.startsWith("kopper:")),
    ).toBe(true);
  });

  it("defines typed command and undo operations", () => {
    const command: DocumentCommand = {
      type: "note.add",
      sectionId: "inbox",
      body: "Captured",
    };
    expect(IPC_CHANNELS.executeCommand).toBe("kopper:command:execute");
    expect(IPC_CHANNELS.undo).toBe("kopper:command:undo");
    expectTypeOf<KopperApi["execute"]>().toBeCallableWith(command);
    expectTypeOf<ReturnType<KopperApi["execute"]>>().toEqualTypeOf<
      ReturnType<KopperApi["getDocument"]>
    >();
    expectTypeOf<ReturnType<KopperApi["undo"]>>().toEqualTypeOf<
      ReturnType<KopperApi["getDocument"]>
    >();
    expectTypeOf<KopperApi["copyNotes"]>().toBeCallableWith(
      ["second", "first"],
      "markdown-list",
    );
  });

  it("runtime-validates clipboard arguments and result envelopes", () => {
    expect(CopyNotesArgumentsSchema.parse([["second", "first"], "plain"])).toEqual([
      ["second", "first"],
      "plain",
    ]);
    for (const input of [
      [[], "plain"],
      [["one", "one"], "plain"],
      [["one"], "html"],
    ]) {
      expect(CopyNotesArgumentsSchema.safeParse(input).success).toBe(false);
    }

    expect(
      parseClipboardCopyResult({ ok: true, value: { copiedCount: 2 } }),
    ).toEqual({ ok: true, value: { copiedCount: 2 } });
    expect(() => ClipboardCopyResultSchema.parse({ ok: true })).toThrow();
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

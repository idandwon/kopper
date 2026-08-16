import { describe, expect, expectTypeOf, it } from "vitest";

import type { DocumentCommand } from "../domain/commands";
import { createEmptyDocument } from "../domain/document";
import { OXIDE_LEDGER_THEME } from "../theme/presets";
import {
  ClipboardCopyResultSchema,
  CopyNotesArgumentsSchema,
  DataImportPreviewResultSchema,
  DocumentResultSchema,
  FileOperationResultSchema,
  IPC_CHANNELS,
  KopperErrorSchema,
  NativeAppearanceResultSchema,
  ThemeExportResultSchema,
  ThemeImportResultSchema,
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

  it("runtime-validates file-operation and import-preview envelopes", () => {
    expect(
      FileOperationResultSchema.parse({
        ok: true,
        value: { cancelled: false, fileName: "export.json" },
      }),
    ).toEqual({
      ok: true,
      value: { cancelled: false, fileName: "export.json" },
    });
    expect(() =>
      FileOperationResultSchema.parse({
        ok: true,
        value: { cancelled: false },
      }),
    ).toThrow();
    expect(() =>
      DataImportPreviewResultSchema.parse({
        ok: true,
        value: {
          token: "not-a-token",
          fileName: "import.json",
          noteCount: 1,
          sectionCount: 1,
        },
      }),
    ).toThrow();
  });

  it("runtime-validates theme and native-appearance envelopes", () => {
    const customTheme = {
      ...structuredClone(OXIDE_LEDGER_THEME),
      id: "custom:preview",
    };
    const preview = {
      theme: customTheme,
      derivedTokens: {
        light: ["capture", "organized"] as const,
        dark: ["completed"] as const,
      },
    };
    expect(
      ThemeImportResultSchema.parse({ ok: true, value: preview }),
    ).toEqual({ ok: true, value: preview });
    for (const malformed of [
      { ...preview, unexpected: true },
      { ...preview, theme: { ...customTheme, unexpected: true } },
      { ...preview, derivedTokens: { ...preview.derivedTokens, light: ["primary"] } },
      { ...preview, derivedTokens: { ...preview.derivedTokens, dark: ["completed", "completed"] } },
    ]) {
      expect(() =>
        ThemeImportResultSchema.parse({ ok: true, value: malformed }),
      ).toThrow();
    }

    const readabilityError = {
      code: "validation_failed" as const,
      message: "Theme readability validation found 2 problems.",
      retryable: false,
      failures: [
        {
          mode: "light" as const,
          backgroundToken: "background" as const,
          foregroundToken: "foreground" as const,
          ratio: 1,
        },
      ],
      opaqueBackgroundModes: ["dark" as const],
    };
    expect(
      ThemeImportResultSchema.parse({ ok: false, error: readabilityError }),
    ).toEqual({ ok: false, error: readabilityError });
    expect(
      KopperErrorSchema.parse({
        code: "read_failed",
        message: "Could not read the theme.",
        retryable: false,
      }),
    ).toEqual({
      code: "read_failed",
      message: "Could not read the theme.",
      retryable: false,
    });
    for (const malformedFailure of [
      { ...readabilityError.failures[0], mode: "system" },
      { ...readabilityError.failures[0], backgroundToken: "muted" },
      { ...readabilityError.failures[0], foregroundToken: "muted-foreground" },
      { ...readabilityError.failures[0], ratio: Number.NaN },
      { ...readabilityError.failures[0], ratio: 22 },
      { ...readabilityError.failures[0], secret: "raw theme bytes" },
    ]) {
      expect(() =>
        ThemeImportResultSchema.parse({
          ok: false,
          error: { ...readabilityError, failures: [malformedFailure] },
        }),
      ).toThrow();
    }
    expect(() =>
      ThemeImportResultSchema.parse({
        ok: false,
        error: { ...readabilityError, opaqueBackgroundModes: ["system"] },
      }),
    ).toThrow();
    expect(
      ThemeExportResultSchema.parse({
        ok: true,
        value: { path: "/private/theme.kopper-theme.json" },
      }),
    ).toEqual({
      ok: true,
      value: { path: "/private/theme.kopper-theme.json" },
    });
    expect(() =>
      ThemeExportResultSchema.parse({
        ok: true,
        value: { path: "/private/theme", contents: "secret" },
      }),
    ).toThrow();
    expect(NativeAppearanceResultSchema.parse({ ok: true, value: false })).toEqual({
      ok: true,
      value: false,
    });
    expect(() =>
      NativeAppearanceResultSchema.parse({ ok: true, value: "dark" }),
    ).toThrow();
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

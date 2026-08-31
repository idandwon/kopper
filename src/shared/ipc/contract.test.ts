import { describe, expect, expectTypeOf, it } from "vitest";

import type { DocumentCommand } from "../domain/commands";
import { createEmptyDocument, ThemeDefinitionSchema } from "../domain/document";
import { OXIDE_LEDGER_THEME } from "../theme/presets";
import {
  AccessibilitySessionResultSchema,
  CaptureOutcomeSchema,
  ClipboardCopyResultSchema,
  CopyNotesArgumentsSchema,
  DataImportPreviewResultSchema,
  DocumentResultSchema,
  FileOperationResultSchema,
  IPC_CHANNELS,
  KopperErrorSchema,
  NativeAppearanceResultSchema,
  PermissionActionResultSchema,
  PermissionPromptArgumentsSchema,
  PermissionResultSchema,
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

  it("strictly validates capture outcomes and the dedicated request method", () => {
    const captured = {
      status: "captured",
      noteId: "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5",
    };
    expect(CaptureOutcomeSchema.parse(captured)).toEqual(captured);
    expect(
      CaptureOutcomeSchema.parse({
        status: "failed",
        error: {
          code: "capture_timeout",
          message: "Kopper timed out while capturing the selected text.",
          retryable: true,
        },
      }),
    ).toMatchObject({ status: "failed" });
    for (const malformed of [
      { status: "captured", noteId: "not-a-uuid" },
      { status: "empty", text: "private selection" },
      { status: "failed", error: { code: "native_error" } },
    ]) {
      expect(CaptureOutcomeSchema.safeParse(malformed).success).toBe(false);
    }
    expectTypeOf<KopperApi["onCaptureOutcome"]>().toBeFunction();
    expectTypeOf<KopperApi["requestCapture"]>().toBeFunction();
  });

  it("defines a no-argument Accessibility repair returning permission state", () => {
    expect(IPC_CHANNELS.repairAccessibilityPermission).toBe(
      "kopper:permission:repair",
    );
    expectTypeOf<KopperApi["repairAccessibilityPermission"]>().toBeCallableWith();
    expectTypeOf<
      Awaited<ReturnType<KopperApi["repairAccessibilityPermission"]>>
    >().toEqualTypeOf<
      Awaited<ReturnType<KopperApi["getAccessibilityPermission"]>>
    >();
  });

  it("runtime-validates clipboard arguments and result envelopes", () => {
    expect(
      CopyNotesArgumentsSchema.parse([["second", "first"], "plain"]),
    ).toEqual([["second", "first"], "plain"]);
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

  it("runtime-validates permission requests, results, and acknowledgements", () => {
    expect(PermissionPromptArgumentsSchema.parse([false])).toEqual([false]);
    expect(PermissionPromptArgumentsSchema.parse([true])).toEqual([true]);
    for (const malformed of [[], ["true"], [false, true]]) {
      expect(PermissionPromptArgumentsSchema.safeParse(malformed).success).toBe(
        false,
      );
    }

    expect(PermissionResultSchema.parse({ ok: true, value: "denied" })).toEqual(
      { ok: true, value: "denied" },
    );
    expect(() =>
      PermissionResultSchema.parse({ ok: true, value: "authorized" }),
    ).toThrow();
    expect(
      PermissionActionResultSchema.parse({
        ok: true,
        value: { acknowledged: true },
      }),
    ).toEqual({ ok: true, value: { acknowledged: true } });
    expect(() =>
      PermissionActionResultSchema.parse({
        ok: true,
        value: { acknowledged: true, permission: "granted" },
      }),
    ).toThrow();
    expect(
      AccessibilitySessionResultSchema.parse({
        ok: true,
        value: { continuedWithoutCapture: true },
      }),
    ).toEqual({ ok: true, value: { continuedWithoutCapture: true } });
    expect(() =>
      AccessibilitySessionResultSchema.parse({
        ok: true,
        value: { continuedWithoutCapture: true, persisted: true },
      }),
    ).toThrow();

    expectTypeOf<KopperApi["getAccessibilityPermission"]>().toBeCallableWith(
      false,
    );
    expectTypeOf<KopperApi["getAccessibilitySession"]>().toBeCallableWith();
    expectTypeOf<KopperApi["continueWithoutCapture"]>().toBeCallableWith();
  });

  it("runtime-validates theme and native-appearance envelopes", () => {
    const customTheme = {
      ...structuredClone(OXIDE_LEDGER_THEME),
      id: "custom:preview",
    };
    const preview = {
      theme: ThemeDefinitionSchema.parse(customTheme),
      normalizedTokens: {
        light: ["radius", "capture", "organized"] as const,
        dark: ["completed"] as const,
      },
    };
    expect(ThemeImportResultSchema.parse({ ok: true, value: preview })).toEqual(
      { ok: true, value: preview },
    );
    for (const malformed of [
      { ...preview, unexpected: true },
      { ...preview, theme: { ...preview.theme, unexpected: true } },
      {
        ...preview,
        normalizedTokens: { ...preview.normalizedTokens, light: ["primary"] },
      },
      {
        ...preview,
        normalizedTokens: {
          ...preview.normalizedTokens,
          dark: ["completed", "completed"],
        },
      },
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
    expect(
      NativeAppearanceResultSchema.parse({ ok: true, value: false }),
    ).toEqual({
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

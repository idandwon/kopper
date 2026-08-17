import { describe, expect, it } from "vitest";

import type { KopperDocument, ThemeDefinition } from "../domain/document";
import { deriveCompleteTheme, validateReadableTheme } from "./deriveTheme";
import {
  BUNDLED_THEMES,
  OXIDE_LEDGER_THEME,
  getThemeById,
} from "./presets";
import {
  THEME_FILE_SCHEMA_URL,
  ThemeFileSchema,
  type ThemeFile,
} from "./themeSchema";

function toExternalTheme(theme: ThemeDefinition): ThemeFile {
  return {
    $schema: THEME_FILE_SCHEMA_URL,
    version: theme.version,
    name: theme.name,
    light: theme.light,
    dark: theme.dark,
  };
}

describe("bundled themes", () => {
  it("ships Oxide Ledger and two complete, uniquely identified presets", () => {
    expect(BUNDLED_THEMES).toHaveLength(3);
    expect(BUNDLED_THEMES[0]).toBe(OXIDE_LEDGER_THEME);
    expect(BUNDLED_THEMES.map(({ id }) => id)).toEqual([
      "builtin:oxide-ledger",
      "builtin:night-workshop",
      "builtin:index-drawer",
    ]);
    expect(new Set(BUNDLED_THEMES.map(({ id }) => id)).size).toBe(3);
  });

  it.each(BUNDLED_THEMES)(
    "$id gives cards and popovers distinct light and dark surfaces",
    (theme) => {
      expect(theme.light.card).not.toBe(theme.light.background);
      expect(theme.light.popover).not.toBe(theme.light.background);
      expect(theme.dark.card).not.toBe(theme.dark.background);
      expect(theme.dark.popover).not.toBe(theme.dark.background);
    },
  );

  it.each(BUNDLED_THEMES)(
    "$id passes external schema projection, derivation, and readability",
    (theme) => {
      const parsed = ThemeFileSchema.safeParse(toExternalTheme(theme));
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      const complete = deriveCompleteTheme(parsed.data);
      expect(complete.light).toEqual(theme.light);
      expect(complete.dark).toEqual(theme.dark);
      expect(validateReadableTheme(complete)).toEqual({
        ok: true,
        value: complete,
      });
    },
  );
});

describe("getThemeById", () => {
  it("resolves reserved bundled IDs before persisted custom themes", () => {
    const impostor = {
      ...OXIDE_LEDGER_THEME,
      name: "Impostor",
    };
    const document = {
      customThemes: [impostor],
    } as KopperDocument;

    expect(getThemeById(document, OXIDE_LEDGER_THEME.id)).toBe(
      OXIDE_LEDGER_THEME,
    );
  });

  it("resolves custom themes and returns null for unknown IDs", () => {
    const custom = {
      ...OXIDE_LEDGER_THEME,
      id: "custom-theme-id",
      name: "Custom",
    };
    const document = { customThemes: [custom] } as KopperDocument;

    expect(getThemeById(document, custom.id)).toBe(custom);
    expect(getThemeById(document, "missing")).toBeNull();
  });
});

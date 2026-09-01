import { describe, expect, it } from "vitest";

import type { KopperDocument, ThemeDefinition } from "../domain/document";
import { deriveCompleteTheme, validateReadableTheme } from "./deriveTheme";
import {
  BUNDLED_THEMES,
  LEGACY_BUNDLED_THEME_IDS,
  OXIDE_LEDGER_THEME,
  SHADCN_DEFAULT_THEME,
  getThemeById,
  isBundledThemeId,
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
  it("ships the canonical shadcn Default theme", () => {
    expect(BUNDLED_THEMES).toEqual([SHADCN_DEFAULT_THEME]);
    expect(SHADCN_DEFAULT_THEME).toMatchObject({
      id: "builtin:shadcn-default",
      version: 1,
      name: "Default",
      light: {
        background: "oklch(1 0 0)",
        foreground: "oklch(0.145 0 0)",
        card: "oklch(1 0 0)",
        "card-foreground": "oklch(0.145 0 0)",
        popover: "oklch(1 0 0)",
        "popover-foreground": "oklch(0.145 0 0)",
        primary: "oklch(0.205 0 0)",
        "primary-foreground": "oklch(0.985 0 0)",
        secondary: "oklch(0.97 0 0)",
        "secondary-foreground": "oklch(0.205 0 0)",
        muted: "oklch(0.97 0 0)",
        "muted-foreground": "oklch(0.556 0 0)",
        accent: "oklch(0.97 0 0)",
        "accent-foreground": "oklch(0.205 0 0)",
        destructive: "oklch(0.577 0.245 27.325)",
        "destructive-foreground": "oklch(0.985 0 0)",
        border: "oklch(0.922 0 0)",
        input: "oklch(0.922 0 0)",
        ring: "oklch(0.708 0 0)",
        radius: "0.625rem",
      },
      dark: {
        background: "oklch(0.145 0 0)",
        foreground: "oklch(0.985 0 0)",
        card: "oklch(0.205 0 0)",
        "card-foreground": "oklch(0.985 0 0)",
        popover: "oklch(0.205 0 0)",
        "popover-foreground": "oklch(0.985 0 0)",
        primary: "oklch(0.922 0 0)",
        "primary-foreground": "oklch(0.205 0 0)",
        secondary: "oklch(0.269 0 0)",
        "secondary-foreground": "oklch(0.985 0 0)",
        muted: "oklch(0.269 0 0)",
        "muted-foreground": "oklch(0.708 0 0)",
        accent: "oklch(0.269 0 0)",
        "accent-foreground": "oklch(0.985 0 0)",
        destructive: "oklch(0.704 0.191 22.216)",
        "destructive-foreground": "oklch(0.985 0 0)",
        border: "oklch(1 0 0 / 10%)",
        input: "oklch(1 0 0 / 15%)",
        ring: "oklch(0.556 0 0)",
        radius: "0.625rem",
      },
    });
  });

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
      for (const mode of [theme.light, theme.dark]) {
        expect(mode.radius).toBe("0.625rem");
        expect(mode.capture).toBe(mode.primary);
        expect(mode.organized).toBe(mode.accent);
        expect(mode.completed).toBe(mode["muted-foreground"]);
      }
    },
  );
});

describe("getThemeById", () => {
  it.each(LEGACY_BUNDLED_THEME_IDS)("resolves %s to Default", (id) => {
    expect(isBundledThemeId(id)).toBe(true);
    expect(getThemeById({ customThemes: [] }, id)).toBe(SHADCN_DEFAULT_THEME);
  });

  it("resolves reserved bundled IDs before persisted custom themes", () => {
    const impostor = {
      ...OXIDE_LEDGER_THEME,
      name: "Impostor",
    };
    const document = {
      customThemes: [impostor],
    } as KopperDocument;

    expect(getThemeById(document, OXIDE_LEDGER_THEME.id)).toBe(SHADCN_DEFAULT_THEME);
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

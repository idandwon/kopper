import { describe, expect, it } from "vitest";

import { SHADCN_THEME_TOKENS } from "./tokens";
import {
  THEME_FILE_SCHEMA_URL,
  ThemeFileSchema,
  type ThemeFile,
} from "./themeSchema";

function validMode(radius = "0.75rem"): Record<string, string> {
  return Object.fromEntries(
    SHADCN_THEME_TOKENS.map((token) => [
      token,
      token === "radius" ? radius : "#173d35",
    ]),
  );
}

function validTheme(): ThemeFile {
  return ThemeFileSchema.parse({
    $schema: THEME_FILE_SCHEMA_URL,
    version: 1,
    name: "Test theme",
    light: validMode(),
    dark: validMode(),
  });
}

describe("ThemeFileSchema", () => {
  it("accepts the exact versioned external shape with optional lifecycle tokens", () => {
    const input = {
      $schema: THEME_FILE_SCHEMA_URL,
      version: 1,
      name: "Test theme",
      light: { ...validMode(), capture: "hsl(18 53% 47%)" },
      dark: validMode(),
    };

    expect(ThemeFileSchema.parse(input)).toEqual(input);
  });

  it("rejects unknown schema versions, empty names, and unknown top-level keys", () => {
    const theme = validTheme();

    expect(ThemeFileSchema.safeParse({ ...theme, version: 2 }).success).toBe(false);
    expect(ThemeFileSchema.safeParse({ ...theme, name: "   " }).success).toBe(false);
    expect(ThemeFileSchema.safeParse({ ...theme, id: "not-external" }).success).toBe(
      false,
    );
  });

  it("rejects missing required shadcn tokens but permits omitted lifecycle tokens", () => {
    const theme = validTheme();
    const { foreground: _foreground, ...missingForeground } = theme.light;

    expect(
      ThemeFileSchema.safeParse({ ...theme, light: missingForeground }).success,
    ).toBe(false);
    expect(theme.light.capture).toBeUndefined();
    expect(theme.light.organized).toBeUndefined();
    expect(theme.light.completed).toBeUndefined();
  });

  it("parses supported CSS colors with Culori and rejects invalid colors", () => {
    const theme = validTheme();

    expect(
      ThemeFileSchema.safeParse({
        ...theme,
        light: {
          ...theme.light,
          foreground: "oklch(45% 0.08 160)",
          primary: "color(display-p3 0.1 0.3 0.2 / 75%)",
        },
      }).success,
    ).toBe(true);
    expect(
      ThemeFileSchema.safeParse({
        ...theme,
        light: { ...theme.light, foreground: "definitely-not-a-color" },
      }).success,
    ).toBe(false);
  });

  it("normalizes raw zero radius and enforces the inclusive 0rem through 2rem range", () => {
    const theme = validTheme();

    expect(
      ThemeFileSchema.parse({
        ...theme,
        light: { ...theme.light, radius: "0" },
      }).light.radius,
    ).toBe("0rem");
    for (const radius of ["0rem", "0.25rem", "1rem", "1.5rem", "2rem", "2.0rem"]) {
      expect(
        ThemeFileSchema.safeParse({
          ...theme,
          light: { ...theme.light, radius },
        }).success,
        radius,
      ).toBe(true);
    }
    for (const radius of ["-0.1rem", "2.01rem", "1px", "1", ".5em"]) {
      expect(
        ThemeFileSchema.safeParse({
          ...theme,
          light: { ...theme.light, radius },
        }).success,
        radius,
      ).toBe(false);
    }
  });

  it.each(["__proto__", "constructor", "prototype"])(
    "rejects prototype-polluting token key %s",
    (pollutingKey) => {
      const theme = validTheme();
      const light = JSON.parse(JSON.stringify(theme.light)) as Record<string, string>;
      Object.defineProperty(light, pollutingKey, {
        value: "#000000",
        enumerable: true,
      });

      expect(ThemeFileSchema.safeParse({ ...theme, light }).success).toBe(false);
    },
  );
});

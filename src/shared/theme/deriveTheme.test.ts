import { describe, expect, it } from "vitest";

import {
  deriveCompleteTheme,
  validateReadableTheme,
} from "./deriveTheme";
import {
  THEME_FILE_SCHEMA_URL,
  ThemeFileSchema,
  type ThemeFile,
  type ThemeMode,
} from "./themeSchema";
import { SHADCN_THEME_TOKENS } from "./tokens";

function readableMode(dark: boolean): Record<string, string> {
  const background = dark ? "#111111" : "#ffffff";
  const foreground = dark ? "#ffffff" : "#111111";
  return Object.fromEntries(
    SHADCN_THEME_TOKENS.map((token) => {
      if (token === "radius") return [token, "0.75rem"];
      if (token.endsWith("-foreground") || token === "foreground") {
        const surface = token.replace(/-foreground$/, "");
        return [
          token,
          ["primary", "accent", "destructive"].includes(surface)
            ? background
            : foreground,
        ];
      }
      return [
        token,
        ["primary", "accent", "destructive"].includes(token)
          ? foreground
          : background,
      ];
    }),
  );
}

function readableTheme(): ThemeFile {
  return ThemeFileSchema.parse({
    $schema: THEME_FILE_SCHEMA_URL,
    version: 1,
    name: "Readable",
    light: readableMode(false),
    dark: readableMode(true),
  });
}

function withMode(
  theme: ThemeFile,
  mode: "light" | "dark",
  overrides: Partial<ThemeMode>,
): ThemeFile {
  return {
    ...theme,
    [mode]: { ...theme[mode], ...overrides },
  };
}

describe("deriveCompleteTheme", () => {
  it("derives missing lifecycle tokens deterministically in both modes", () => {
    const theme = readableTheme();
    const complete = deriveCompleteTheme(theme);

    for (const mode of ["light", "dark"] as const) {
      expect(complete[mode].capture).toBe(theme[mode].primary);
      expect(complete[mode].organized).toBe(theme[mode].accent);
      expect(complete[mode].completed).toBe(theme[mode]["muted-foreground"]);
    }
  });

  it("preserves explicitly supplied lifecycle tokens", () => {
    const theme = withMode(readableTheme(), "light", {
      capture: "#8a482d",
      organized: "#446b62",
      completed: "#637a68",
    });

    expect(deriveCompleteTheme(theme).light).toEqual(theme.light);
  });
});

describe("validateReadableTheme", () => {
  it("accepts a theme when every required semantic pair meets 4.5:1", () => {
    const complete = deriveCompleteTheme(readableTheme());

    expect(validateReadableTheme(complete)).toEqual({
      ok: true,
      value: complete,
    });
  });

  it("returns every failing semantic pair with ratios rounded to two decimals", () => {
    let theme = readableTheme();
    theme = withMode(theme, "light", {
      foreground: "#dddddd",
      "card-foreground": "#cccccc",
    });
    theme = withMode(theme, "dark", {
      "primary-foreground": "#eeeeee",
      "accent-foreground": "#dddddd",
    });

    const result = validateReadableTheme(deriveCompleteTheme(theme));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("validation_failed");
    expect(result.error.failures).toEqual([
      {
        mode: "light",
        backgroundToken: "background",
        foregroundToken: "foreground",
        ratio: 1.36,
      },
      {
        mode: "light",
        backgroundToken: "card",
        foregroundToken: "card-foreground",
        ratio: 1.61,
      },
      {
        mode: "dark",
        backgroundToken: "primary",
        foregroundToken: "primary-foreground",
        ratio: 1.16,
      },
      {
        mode: "dark",
        backgroundToken: "accent",
        foregroundToken: "accent-foreground",
        ratio: 1.36,
      },
    ]);
  });

  it("composites alpha foregrounds and semantic surfaces before contrast", () => {
    let theme = readableTheme();
    theme = withMode(theme, "light", {
      card: "rgb(0 0 0 / 50%)",
      "card-foreground": "#ffffff",
      foreground: "rgb(0 0 0 / 50%)",
    });

    const result = validateReadableTheme(deriveCompleteTheme(theme));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mode: "light",
          backgroundToken: "background",
          foregroundToken: "foreground",
          ratio: 3.98,
        }),
        expect.objectContaining({
          mode: "light",
          backgroundToken: "card",
          foregroundToken: "card-foreground",
          ratio: 3.98,
        }),
      ]),
    );
  });

  it("does not let CSS missing color channels bypass contrast validation", () => {
    const theme = withMode(readableTheme(), "light", {
      foreground: "rgb(none 100% 100%)",
    });

    const result = validateReadableTheme(deriveCompleteTheme(theme));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mode: "light",
          backgroundToken: "background",
          foregroundToken: "foreground",
        }),
      ]),
    );
  });

  it("rejects translucent root backgrounds because their canvas is undefined", () => {
    const theme = withMode(readableTheme(), "dark", {
      background: "rgb(17 17 17 / 90%)",
    });

    const result = validateReadableTheme(deriveCompleteTheme(theme));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.opaqueBackgroundModes).toEqual(["dark"]);
    expect(result.error.message).toContain("opaque root background");
  });
});

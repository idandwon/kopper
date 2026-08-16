import { clampRgb, converter, wcagContrast, type Rgb } from "culori";

import type {
  KopperError,
  Result,
  ThemeContrastFailure,
} from "../domain/errors";
import type {
  CompleteThemeMode,
  ThemeFile,
  ThemeMode,
} from "./themeSchema";
import { SHADCN_THEME_TOKENS } from "./tokens";

export interface CompleteThemeFile
  extends Omit<ThemeFile, "light" | "dark"> {
  light: CompleteThemeMode;
  dark: CompleteThemeMode;
}

export interface ThemeReadabilityError extends KopperError {
  code: "validation_failed";
  failures: ThemeContrastFailure[];
  opaqueBackgroundModes: Array<"light" | "dark">;
}

export type ThemeReadabilityResult = Result<
  CompleteThemeFile,
  ThemeReadabilityError
>;

const REQUIRED_CONTRAST_PAIRS = [
  ["background", "foreground"],
  ["card", "card-foreground"],
  ["popover", "popover-foreground"],
  ["primary", "primary-foreground"],
  ["accent", "accent-foreground"],
] as const;

const toRgb = converter("rgb");

function deriveMode(mode: ThemeMode): CompleteThemeMode {
  const complete = {} as CompleteThemeMode;
  for (const token of SHADCN_THEME_TOKENS) complete[token] = mode[token];
  complete.capture = mode.capture ?? mode.primary;
  complete.organized = mode.organized ?? mode.accent;
  complete.completed = mode.completed ?? mode["muted-foreground"];
  return complete;
}

export function deriveCompleteTheme(theme: ThemeFile): CompleteThemeFile {
  return {
    $schema: theme.$schema,
    version: theme.version,
    name: theme.name,
    light: deriveMode(theme.light),
    dark: deriveMode(theme.dark),
  };
}

function parsedRgb(value: string): Rgb {
  const converted = toRgb(value);
  if (converted === undefined) {
    throw new TypeError("Theme colors must be schema-validated before readability checks.");
  }
  const clamped = clampRgb(converted);
  return {
    mode: "rgb",
    r: Number.isFinite(clamped.r) ? clamped.r : 0,
    g: Number.isFinite(clamped.g) ? clamped.g : 0,
    b: Number.isFinite(clamped.b) ? clamped.b : 0,
    alpha:
      clamped.alpha === undefined || !Number.isFinite(clamped.alpha)
        ? 1
        : clamped.alpha,
  };
}

function composite(foreground: Rgb, background: Rgb): Rgb {
  const alpha = foreground.alpha ?? 1;
  return {
    mode: "rgb",
    r: foreground.r * alpha + background.r * (1 - alpha),
    g: foreground.g * alpha + background.g * (1 - alpha),
    b: foreground.b * alpha + background.b * (1 - alpha),
    alpha: 1,
  };
}

function roundedRatio(ratio: number): number {
  return Number(ratio.toFixed(2));
}

export function validateReadableTheme(
  theme: CompleteThemeFile,
): ThemeReadabilityResult {
  const failures: ThemeContrastFailure[] = [];
  const opaqueBackgroundModes: Array<"light" | "dark"> = [];

  for (const modeName of ["light", "dark"] as const) {
    const mode = theme[modeName];
    const rootBackground = parsedRgb(mode.background);
    if ((rootBackground.alpha ?? 1) < 1) {
      opaqueBackgroundModes.push(modeName);
      continue;
    }

    for (const [backgroundToken, foregroundToken] of REQUIRED_CONTRAST_PAIRS) {
      const semanticBackground =
        backgroundToken === "background"
          ? rootBackground
          : composite(parsedRgb(mode[backgroundToken]), rootBackground);
      const semanticForeground = composite(
        parsedRgb(mode[foregroundToken]),
        semanticBackground,
      );
      const ratio = wcagContrast(semanticBackground, semanticForeground);
      if (ratio < 4.5) {
        failures.push({
          mode: modeName,
          backgroundToken,
          foregroundToken,
          ratio: roundedRatio(ratio),
        });
      }
    }
  }

  if (failures.length === 0 && opaqueBackgroundModes.length === 0) {
    return { ok: true, value: theme };
  }

  const problemCount = failures.length + opaqueBackgroundModes.length;
  const opaqueMessage =
    opaqueBackgroundModes.length > 0
      ? " Each mode must use an opaque root background because the window canvas is undefined."
      : "";
  return {
    ok: false,
    error: {
      code: "validation_failed",
      message: `Theme readability validation found ${problemCount} problem${problemCount === 1 ? "" : "s"}.${opaqueMessage}`,
      retryable: false,
      failures,
      opaqueBackgroundModes,
    },
  };
}

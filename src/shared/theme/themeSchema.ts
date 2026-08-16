import { parse as parseColor } from "culori";
import { z } from "zod";

import {
  KOPPER_THEME_TOKENS,
  SHADCN_THEME_TOKENS,
  type KopperThemeToken,
  type ShadcnThemeToken,
} from "./tokens";

export const THEME_FILE_SCHEMA_URL =
  "https://kopper.local/schemas/theme-v1.json" as const;

const COLOR_THEME_TOKENS = SHADCN_THEME_TOKENS.filter(
  (token): token is Exclude<ShadcnThemeToken, "radius"> => token !== "radius",
);
const ALLOWED_THEME_TOKENS = [
  ...SHADCN_THEME_TOKENS,
  ...KOPPER_THEME_TOKENS,
] as const;
const AllowedThemeTokenSchema = z.enum(ALLOWED_THEME_TOKENS);
const allowedThemeTokenSet = new Set<string>(ALLOWED_THEME_TOKENS);
const explicitThemeTokenKeysSchema = z.unknown().superRefine((input, context) => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return;
  for (const key of Object.keys(input)) {
    if (!allowedThemeTokenSet.has(key)) {
      context.addIssue({
        code: "custom",
        path: [key],
        message: `Unknown theme token: ${key}`,
      });
    }
  }
});
const rawThemeModeSchema = explicitThemeTokenKeysSchema.pipe(
  z.partialRecord(AllowedThemeTokenSchema, z.string()),
);
const RADIUS_PATTERN = /^(0|0?\.\d+|1(?:\.\d+)?|2(?:\.0+)?)rem$/;
const EXPLICIT_MISSING_ALPHA_PATTERN = /\/\s*none\s*\)$/i;

export type ThemeMode = Record<ShadcnThemeToken, string> &
  Partial<Record<KopperThemeToken, string>>;
export type CompleteThemeMode = Record<
  ShadcnThemeToken | KopperThemeToken,
  string
>;

function validateThemeMode(
  mode: Partial<Record<(typeof ALLOWED_THEME_TOKENS)[number], string>>,
  context: z.RefinementCtx,
  requireLifecycle: boolean,
): void {
  for (const token of COLOR_THEME_TOKENS) {
    const value = mode[token];
    if (value === undefined) {
      context.addIssue({
        code: "custom",
        path: [token],
        message: `Missing required theme token: ${token}`,
      });
    } else if (parseColor(value) === undefined) {
      context.addIssue({
        code: "custom",
        path: [token],
        message: `Invalid CSS color for theme token: ${token}`,
      });
    } else if (EXPLICIT_MISSING_ALPHA_PATTERN.test(value)) {
      context.addIssue({
        code: "custom",
        path: [token],
        message: `Theme color alpha cannot be none: ${token}`,
      });
    }
  }

  const radius = mode.radius === "0" ? "0rem" : mode.radius;
  if (radius === undefined) {
    context.addIssue({
      code: "custom",
      path: ["radius"],
      message: "Missing required theme token: radius",
    });
  } else if (!RADIUS_PATTERN.test(radius)) {
    context.addIssue({
      code: "custom",
      path: ["radius"],
      message: "Radius must be between 0rem and 2rem.",
    });
  }

  for (const token of KOPPER_THEME_TOKENS) {
    const value = mode[token];
    if (requireLifecycle && value === undefined) {
      context.addIssue({
        code: "custom",
        path: [token],
        message: `Missing required theme token: ${token}`,
      });
    } else if (value !== undefined && parseColor(value) === undefined) {
      context.addIssue({
        code: "custom",
        path: [token],
        message: `Invalid CSS color for theme token: ${token}`,
      });
    } else if (
      value !== undefined &&
      EXPLICIT_MISSING_ALPHA_PATTERN.test(value)
    ) {
      context.addIssue({
        code: "custom",
        path: [token],
        message: `Theme color alpha cannot be none: ${token}`,
      });
    }
  }
}

function normalizeThemeMode(
  mode: Partial<Record<(typeof ALLOWED_THEME_TOKENS)[number], string>>,
): ThemeMode {
  const normalized: Partial<Record<(typeof ALLOWED_THEME_TOKENS)[number], string>> =
    {};
  for (const token of ALLOWED_THEME_TOKENS) {
    const value = mode[token];
    if (value !== undefined) {
      normalized[token] = token === "radius" && value === "0" ? "0rem" : value;
    }
  }
  return normalized as ThemeMode;
}

export const ThemeModeSchema: z.ZodType<ThemeMode> = rawThemeModeSchema
  .superRefine((mode, context) => validateThemeMode(mode, context, false))
  .transform(normalizeThemeMode);

export const CompleteThemeModeSchema: z.ZodType<CompleteThemeMode> =
  rawThemeModeSchema
    .superRefine((mode, context) => validateThemeMode(mode, context, true))
    .transform((mode) => normalizeThemeMode(mode) as CompleteThemeMode);

export const ThemeFileSchema = z.strictObject({
  $schema: z.literal(THEME_FILE_SCHEMA_URL),
  version: z.literal(1),
  name: z.string().trim().min(1),
  light: ThemeModeSchema,
  dark: ThemeModeSchema,
});

export type ThemeFile = z.infer<typeof ThemeFileSchema>;

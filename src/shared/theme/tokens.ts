export const SHADCN_THEME_TOKENS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
  "radius",
] as const;

export const KOPPER_THEME_TOKENS = [
  "capture",
  "organized",
  "completed",
] as const;

export const DEFAULT_THEME_RADIUS = "0.625rem" as const;

export const LEGACY_THEME_OVERRIDE_TOKENS = [
  "radius",
  ...KOPPER_THEME_TOKENS,
] as const;

export type ShadcnThemeToken = (typeof SHADCN_THEME_TOKENS)[number];
export type KopperThemeToken = (typeof KOPPER_THEME_TOKENS)[number];
export type LegacyThemeOverrideToken =
  (typeof LEGACY_THEME_OVERRIDE_TOKENS)[number];
export type ThemeToken = ShadcnThemeToken | KopperThemeToken;

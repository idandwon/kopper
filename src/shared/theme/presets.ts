import type { KopperDocument, ThemeDefinition } from "../domain/document";
import type { CompleteThemeMode } from "./themeSchema";
import { DEFAULT_THEME_RADIUS } from "./tokens";

interface ModePalette {
  background: string;
  card: string;
  popover: string;
  foreground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
}

function createMode(palette: ModePalette): CompleteThemeMode {
  return {
    background: palette.background,
    foreground: palette.foreground,
    card: palette.card,
    "card-foreground": palette.foreground,
    popover: palette.popover,
    "popover-foreground": palette.foreground,
    primary: palette.primary,
    "primary-foreground": palette.primaryForeground,
    secondary: palette.secondary,
    "secondary-foreground": palette.secondaryForeground,
    muted: palette.muted,
    "muted-foreground": palette.mutedForeground,
    accent: palette.accent,
    "accent-foreground": palette.accentForeground,
    destructive: palette.destructive,
    "destructive-foreground": palette.destructiveForeground,
    border: palette.border,
    input: palette.input,
    ring: palette.ring,
    radius: DEFAULT_THEME_RADIUS,
    capture: palette.primary,
    organized: palette.accent,
    completed: palette.mutedForeground,
  };
}

export const LEGACY_BUNDLED_THEME_IDS = [
  "builtin:oxide-ledger",
  "builtin:night-workshop",
  "builtin:index-drawer",
] as const;

const bundledThemeIds = new Set<string>([
  "builtin:shadcn-default",
  ...LEGACY_BUNDLED_THEME_IDS,
]);

export const SHADCN_DEFAULT_THEME: ThemeDefinition = {
  id: "builtin:shadcn-default",
  version: 1,
  name: "Default",
  light: createMode({
    background: "oklch(1 0 0)",
    card: "oklch(1 0 0)",
    popover: "oklch(1 0 0)",
    foreground: "oklch(0.145 0 0)",
    primary: "oklch(0.205 0 0)",
    primaryForeground: "oklch(0.985 0 0)",
    secondary: "oklch(0.97 0 0)",
    secondaryForeground: "oklch(0.205 0 0)",
    muted: "oklch(0.97 0 0)",
    mutedForeground: "oklch(0.556 0 0)",
    accent: "oklch(0.97 0 0)",
    accentForeground: "oklch(0.205 0 0)",
    destructive: "oklch(0.577 0.245 27.325)",
    destructiveForeground: "oklch(0.985 0 0)",
    border: "oklch(0.922 0 0)",
    input: "oklch(0.922 0 0)",
    ring: "oklch(0.708 0 0)",
  }),
  dark: createMode({
    background: "oklch(0.145 0 0)",
    card: "oklch(0.205 0 0)",
    popover: "oklch(0.205 0 0)",
    foreground: "oklch(0.985 0 0)",
    primary: "oklch(0.922 0 0)",
    primaryForeground: "oklch(0.205 0 0)",
    secondary: "oklch(0.269 0 0)",
    secondaryForeground: "oklch(0.985 0 0)",
    muted: "oklch(0.269 0 0)",
    mutedForeground: "oklch(0.708 0 0)",
    accent: "oklch(0.269 0 0)",
    accentForeground: "oklch(0.985 0 0)",
    destructive: "oklch(0.704 0.191 22.216)",
    destructiveForeground: "oklch(0.985 0 0)",
    border: "oklch(1 0 0 / 10%)",
    input: "oklch(1 0 0 / 15%)",
    ring: "oklch(0.556 0 0)",
  }),
};

export const BUNDLED_THEMES = [SHADCN_DEFAULT_THEME] as const;

export function isBundledThemeId(id: string): boolean {
  return bundledThemeIds.has(id);
}

export function getThemeById(
  document: Pick<KopperDocument, "customThemes">,
  id: string,
): ThemeDefinition | null {
  if (isBundledThemeId(id)) return SHADCN_DEFAULT_THEME;
  return document.customThemes.find((theme) => theme.id === id) ?? null;
}

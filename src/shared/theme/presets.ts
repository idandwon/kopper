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

function createAccentTheme({
  id,
  name,
  lightPrimary,
  lightPrimaryForeground,
  darkPrimary,
  darkPrimaryForeground,
}: {
  id: string;
  name: string;
  lightPrimary: string;
  lightPrimaryForeground: string;
  darkPrimary: string;
  darkPrimaryForeground: string;
}): ThemeDefinition {
  return {
    id,
    version: 1,
    name,
    light: {
      ...SHADCN_DEFAULT_THEME.light,
      primary: lightPrimary,
      "primary-foreground": lightPrimaryForeground,
      ring: lightPrimary,
      capture: lightPrimary,
    },
    dark: {
      ...SHADCN_DEFAULT_THEME.dark,
      primary: darkPrimary,
      "primary-foreground": darkPrimaryForeground,
      ring: darkPrimary,
      capture: darkPrimary,
    },
  };
}

export const COBALT_THEME = createAccentTheme({
  id: "builtin:shadcn-cobalt",
  name: "Cobalt",
  lightPrimary: "oklch(0.488 0.243 264.376)",
  lightPrimaryForeground: "oklch(0.985 0 0)",
  darkPrimary: "oklch(0.707 0.165 254.624)",
  darkPrimaryForeground: "oklch(0.205 0 0)",
});

export const VIOLET_THEME = createAccentTheme({
  id: "builtin:shadcn-violet",
  name: "Violet",
  lightPrimary: "oklch(0.491 0.27 292.581)",
  lightPrimaryForeground: "oklch(0.985 0 0)",
  darkPrimary: "oklch(0.702 0.183 293.541)",
  darkPrimaryForeground: "oklch(0.205 0 0)",
});

export const BUNDLED_THEMES = [
  SHADCN_DEFAULT_THEME,
  COBALT_THEME,
  VIOLET_THEME,
] as const;

const bundledThemesById = new Map<string, ThemeDefinition>(
  BUNDLED_THEMES.map((theme) => [theme.id, theme]),
);
const legacyBundledThemeIds = new Set<string>(LEGACY_BUNDLED_THEME_IDS);

export function isBundledThemeId(id: string): boolean {
  return bundledThemesById.has(id) || legacyBundledThemeIds.has(id);
}

export function getThemeById(
  document: Pick<KopperDocument, "customThemes">,
  id: string,
): ThemeDefinition | null {
  const bundled = bundledThemesById.get(id);
  if (bundled !== undefined) return bundled;
  if (legacyBundledThemeIds.has(id)) return SHADCN_DEFAULT_THEME;
  return document.customThemes.find((theme) => theme.id === id) ?? null;
}

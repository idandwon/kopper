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

export const OXIDE_LEDGER_THEME: ThemeDefinition = {
  id: "builtin:oxide-ledger",
  version: 1,
  name: "Oxide Ledger",
  light: createMode({
    background: "#F6F9F6",
    card: "#FFFFFF",
    popover: "#FFFFFF",
    foreground: "#173D35",
    primary: "#173D35",
    primaryForeground: "#F6F9F6",
    secondary: "#C7D9D5",
    secondaryForeground: "#173D35",
    muted: "#C7D9D5",
    mutedForeground: "#173D35",
    accent: "#C7D9D5",
    accentForeground: "#173D35",
    destructive: "#173D35",
    destructiveForeground: "#F6F9F6",
    border: "#C7D9D5",
    input: "#C7D9D5",
    ring: "#2E8775",
  }),
  dark: createMode({
    background: "#173D35",
    card: "#20483F",
    popover: "#20483F",
    foreground: "#F6F9F6",
    primary: "#F6F9F6",
    primaryForeground: "#173D35",
    secondary: "#2E8775",
    secondaryForeground: "#F6F9F6",
    muted: "#2E8775",
    mutedForeground: "#F6F9F6",
    accent: "#C7D9D5",
    accentForeground: "#173D35",
    destructive: "#F6F9F6",
    destructiveForeground: "#173D35",
    border: "#2E8775",
    input: "#2E8775",
    ring: "#C7D9D5",
  }),
};

const NIGHT_WORKSHOP_THEME: ThemeDefinition = {
  id: "builtin:night-workshop",
  version: 1,
  name: "Night Workshop",
  light: createMode({
    background: "#F0ECE6",
    card: "#FAF8F4",
    popover: "#FFFFFF",
    foreground: "#25282A",
    primary: "#774028",
    primaryForeground: "#FFFFFF",
    secondary: "#D7E2DF",
    secondaryForeground: "#25282A",
    muted: "#DDD9D2",
    mutedForeground: "#414649",
    accent: "#D7E2DF",
    accentForeground: "#25282A",
    destructive: "#7A2E2E",
    destructiveForeground: "#FFFFFF",
    border: "#C4C0BA",
    input: "#C4C0BA",
    ring: "#527166",
  }),
  dark: createMode({
    background: "#202326",
    card: "#2A2E31",
    popover: "#303538",
    foreground: "#F0ECE6",
    primary: "#D59774",
    primaryForeground: "#202326",
    secondary: "#3B5E56",
    secondaryForeground: "#FFFFFF",
    muted: "#34393C",
    mutedForeground: "#C8C3BC",
    accent: "#3B5E56",
    accentForeground: "#FFFFFF",
    destructive: "#C86B67",
    destructiveForeground: "#202326",
    border: "#454B4E",
    input: "#454B4E",
    ring: "#7BA296",
  }),
};

const INDEX_DRAWER_THEME: ThemeDefinition = {
  id: "builtin:index-drawer",
  version: 1,
  name: "Index Drawer",
  light: createMode({
    background: "#F4F0E7",
    card: "#FFFDF8",
    popover: "#FFFFFF",
    foreground: "#29251F",
    primary: "#8B4B2D",
    primaryForeground: "#FFFFFF",
    secondary: "#DFD6C7",
    secondaryForeground: "#29251F",
    muted: "#E6DED1",
    mutedForeground: "#514A40",
    accent: "#D8E0D6",
    accentForeground: "#29251F",
    destructive: "#8A332B",
    destructiveForeground: "#FFFFFF",
    border: "#C9BEAE",
    input: "#C9BEAE",
    ring: "#637A68",
  }),
  dark: createMode({
    background: "#29251F",
    card: "#342F28",
    popover: "#3B352D",
    foreground: "#F4F0E7",
    primary: "#D59A77",
    primaryForeground: "#29251F",
    secondary: "#526858",
    secondaryForeground: "#FFFFFF",
    muted: "#3A352D",
    mutedForeground: "#D2C8B9",
    accent: "#526858",
    accentForeground: "#FFFFFF",
    destructive: "#D47A70",
    destructiveForeground: "#29251F",
    border: "#514A40",
    input: "#514A40",
    ring: "#8DA394",
  }),
};

export const BUNDLED_THEMES: readonly ThemeDefinition[] = [
  OXIDE_LEDGER_THEME,
  NIGHT_WORKSHOP_THEME,
  INDEX_DRAWER_THEME,
];

export function getThemeById(
  document: Pick<KopperDocument, "customThemes">,
  id: string,
): ThemeDefinition | null {
  return (
    BUNDLED_THEMES.find((theme) => theme.id === id) ??
    document.customThemes.find((theme) => theme.id === id) ??
    null
  );
}

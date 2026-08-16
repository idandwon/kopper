import type { KopperDocument, ThemeDefinition } from "../domain/document";
import type { CompleteThemeMode } from "./themeSchema";

interface ModePalette {
  background: string;
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
  capture: string;
  organized: string;
  completed: string;
  radius: string;
}

function createMode(palette: ModePalette): CompleteThemeMode {
  return {
    background: palette.background,
    foreground: palette.foreground,
    card: palette.background,
    "card-foreground": palette.foreground,
    popover: palette.background,
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
    radius: palette.radius,
    capture: palette.capture,
    organized: palette.organized,
    completed: palette.completed,
  };
}

export const OXIDE_LEDGER_THEME: ThemeDefinition = {
  id: "builtin:oxide-ledger",
  version: 1,
  name: "Oxide Ledger",
  light: createMode({
    background: "#F6F9F6",
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
    capture: "#B86138",
    organized: "#2E8775",
    completed: "#2E8775",
    radius: "0.75rem",
  }),
  dark: createMode({
    background: "#173D35",
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
    capture: "#B86138",
    organized: "#2E8775",
    completed: "#2E8775",
    radius: "0.75rem",
  }),
};

const NIGHT_WORKSHOP_THEME: ThemeDefinition = {
  id: "builtin:night-workshop",
  version: 1,
  name: "Night Workshop",
  light: createMode({
    background: "#F0ECE6",
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
    capture: "#9A5435",
    organized: "#527166",
    completed: "#527166",
    radius: "0.625rem",
  }),
  dark: createMode({
    background: "#202326",
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
    capture: "#B96E4C",
    organized: "#66877E",
    completed: "#66877E",
    radius: "0.625rem",
  }),
};

const INDEX_DRAWER_THEME: ThemeDefinition = {
  id: "builtin:index-drawer",
  version: 1,
  name: "Index Drawer",
  light: createMode({
    background: "#F4F0E7",
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
    capture: "#8B4B2D",
    organized: "#637A68",
    completed: "#637A68",
    radius: "0.375rem",
  }),
  dark: createMode({
    background: "#29251F",
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
    capture: "#B87350",
    organized: "#718878",
    completed: "#718878",
    radius: "0.375rem",
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

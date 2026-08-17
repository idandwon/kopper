export type SettingsTab = "shortcuts" | "appearance" | "data";

export type PanelRoute =
  | { page: "notes" }
  | {
      page: "settings";
      tab: SettingsTab;
      returnFocus: "menu" | "search";
    };

export function isSettingsTab(value: string): value is SettingsTab {
  return value === "shortcuts" || value === "appearance" || value === "data";
}

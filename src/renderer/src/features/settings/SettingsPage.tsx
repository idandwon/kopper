import { useEffect } from "react";

import { Button } from "../../components/ui/button";
import { ScrollArea } from "../../components/ui/scroll-area";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import { AppearanceSettings } from "./AppearanceSettings";
import { DataSettings } from "./DataSettings";
import { ShortcutSettings } from "./ShortcutSettings";
import { isSettingsTab, type SettingsTab } from "./settingsRoute";

interface SettingsPageProps {
  activeTab: SettingsTab;
  captureUnavailable: boolean;
  changeTab(tab: SettingsTab): void;
  closeSettings(): void;
}

function focusedOwnerKeepsEscape(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element.isContentEditable ||
    element.closest("[contenteditable]") !== null ||
    element.closest('[role="menu"], [role="dialog"]') !== null
  );
}

export function SettingsPage({
  activeTab,
  captureUnavailable,
  changeTab,
  closeSettings,
}: SettingsPageProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        focusedOwnerKeepsEscape(globalThis.document.activeElement)
      ) {
        return;
      }
      event.preventDefault();
      closeSettings();
    };

    globalThis.addEventListener("keydown", closeOnEscape);
    return () => globalThis.removeEventListener("keydown", closeOnEscape);
  }, [closeSettings]);

  const selectTab = (value: string) => {
    if (!isSettingsTab(value)) return;
    changeTab(value);
  };

  return (
    <Tabs
      value={activeTab}
      onValueChange={selectTab}
      className="flex min-h-0 flex-1 flex-col"
    >
      <header className="shrink-0 border-b border-border px-4 pt-4 pl-5">
        <div className="mb-3 flex items-center gap-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            autoFocus
            aria-label="Back to notes"
            onClick={closeSettings}
          >
            <span aria-hidden="true">←</span>
            Back
          </Button>
          <div>
            <h1 className="m-0 text-base font-semibold">Settings</h1>
            <p className="m-0 text-xs text-muted-foreground">
              Shortcuts, appearance, and local data controls.
            </p>
          </div>
        </div>
        <TabsList aria-label="Settings sections" className="w-full">
          <TabsTrigger value="shortcuts">Shortcuts</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
        </TabsList>
      </header>

      <ScrollArea
        data-scroll-owner="settings"
        className="min-h-0 flex-1"
        aria-label="Settings content"
      >
        <div className="px-4 py-4 pl-5">
          <TabsContent value="shortcuts" className="mt-0">
            <ShortcutSettings captureUnavailable={captureUnavailable} />
          </TabsContent>
          <TabsContent value="appearance" className="mt-0">
            <AppearanceSettings />
          </TabsContent>
          <TabsContent value="data" className="mt-0">
            <DataSettings />
          </TabsContent>
        </div>
      </ScrollArea>
    </Tabs>
  );
}

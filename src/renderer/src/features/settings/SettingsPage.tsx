import { useEffect, useRef } from "react";

import { Button } from "../../components/ui/button";
import { ScrollArea } from "../../components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";
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
  focusRequest?: number;
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
    element.closest(
      '[role="menu"], [role="dialog"], [role="listbox"], [role="option"]',
    ) !== null
  );
}

export function SettingsPage({
  activeTab,
  captureUnavailable,
  focusRequest = 0,
  changeTab,
  closeSettings,
}: SettingsPageProps) {
  const backButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const frame = globalThis.requestAnimationFrame(() =>
      backButtonRef.current?.focus({ preventScroll: true }),
    );
    return () => globalThis.cancelAnimationFrame(frame);
  }, [focusRequest]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
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
      className="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <header className="min-w-0 shrink-0 border-b border-border pt-4 pr-14 pl-4">
        <div className="mb-3 flex min-w-0 items-center gap-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="size-8"
                  ref={backButtonRef}
                  autoFocus
                  aria-label="Back to notes"
                  onClick={closeSettings}
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.75"
                    aria-hidden="true"
                    className="size-4"
                  >
                    <path d="m12.5 4.5-5.5 5.5 5.5 5.5" />
                  </svg>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back to notes</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="min-w-0">
            <h1 className="m-0 text-base font-semibold">Settings</h1>
            <p className="m-0 break-words text-xs text-muted-foreground">
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
        <div className="min-w-0 px-4 py-4">
          <TabsContent
            value="shortcuts"
            forceMount
            hidden={activeTab !== "shortcuts"}
            className="mt-0 min-w-0"
          >
            <ShortcutSettings
              active={activeTab === "shortcuts"}
              captureUnavailable={captureUnavailable}
            />
          </TabsContent>
          <TabsContent value="appearance" className="mt-0 min-w-0">
            <AppearanceSettings />
          </TabsContent>
          <TabsContent value="data" className="mt-0 min-w-0">
            <DataSettings />
          </TabsContent>
        </div>
      </ScrollArea>
    </Tabs>
  );
}

import { useEffect, useRef, useState } from "react";

import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { AppearanceSettings } from "../settings/AppearanceSettings";
import { DataSettings } from "../settings/DataSettings";
import { ShortcutSettings } from "../settings/ShortcutSettings";

type SettingsTab = "shortcuts" | "appearance" | "data";

function isSettingsTab(value: string): value is SettingsTab {
  return value === "shortcuts" || value === "appearance" || value === "data";
}

export function PanelMenu({
  captureUnavailable,
}: {
  captureUnavailable: boolean;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("appearance");
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    return window.kopper.onOpenSettings(() => {
      setSettingsTab("shortcuts");
      setSettingsOpen(true);
    });
  }, []);

  const openAppearanceSettings = () => {
    setSettingsTab("appearance");
    setSettingsOpen(true);
  };

  const restoreMenuFocus = (event: Event) => {
    event.preventDefault();
    triggerRef.current?.focus();
  };

  const changeSettingsTab = (value: string) => {
    if (!isSettingsTab(value)) return;
    setSettingsTab(value);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            type="button"
            variant="ghost"
            size="xs"
            aria-label="Panel menu"
          >
            <span aria-hidden="true">•••</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={openAppearanceSettings}>
            Settings…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent onCloseAutoFocus={restoreMenuFocus}>
          <SheetHeader>
            <SheetTitle>Settings</SheetTitle>
            <SheetDescription>
              Shortcuts, appearance, and local data controls.
            </SheetDescription>
          </SheetHeader>
          <Tabs
            value={settingsTab}
            onValueChange={changeSettingsTab}
            className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
          >
            <TabsList aria-label="Settings sections">
              <TabsTrigger value="shortcuts">Shortcuts</TabsTrigger>
              <TabsTrigger value="appearance">Appearance</TabsTrigger>
              <TabsTrigger value="data">Data</TabsTrigger>
            </TabsList>
            <TabsContent value="shortcuts">
              <ShortcutSettings captureUnavailable={captureUnavailable} />
            </TabsContent>
            <TabsContent value="appearance">
              <AppearanceSettings />
            </TabsContent>
            <TabsContent value="data">
              <DataSettings />
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </>
  );
}

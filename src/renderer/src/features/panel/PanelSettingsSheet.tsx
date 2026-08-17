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

export type SettingsTab = "shortcuts" | "appearance" | "data";

function isSettingsTab(value: string): value is SettingsTab {
  return value === "shortcuts" || value === "appearance" || value === "data";
}

interface PanelSettingsSheetProps {
  activeTab: SettingsTab;
  captureUnavailable: boolean;
  open: boolean;
  changeOpen(open: boolean): void;
  changeTab(tab: SettingsTab): void;
  restoreMenuFocus(event: Event): void;
}

export function PanelSettingsSheet({
  activeTab,
  captureUnavailable,
  open,
  changeOpen,
  changeTab,
  restoreMenuFocus,
}: PanelSettingsSheetProps) {
  const selectTab = (value: string) => {
    if (!isSettingsTab(value)) return;
    changeTab(value);
  };

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetContent onCloseAutoFocus={restoreMenuFocus}>
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            Shortcuts, appearance, and local data controls.
          </SheetDescription>
        </SheetHeader>
        <Tabs
          value={activeTab}
          onValueChange={selectTab}
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
  );
}

import type { Ref } from "react";

import { TabsList, TabsTrigger } from "../../components/ui/tabs";
import type { SettingsTab } from "../settings/settingsRoute";
import { SearchField } from "../search/SearchField";
import { PanelMenu } from "./PanelMenu";
import { PanelPinButton } from "./PanelPinButton";

interface PanelHeaderProps {
  query: string;
  searchInputRef: Ref<HTMLInputElement>;
  menuTriggerRef: Ref<HTMLButtonElement>;
  changeQuery(query: string): void;
  openSettings(tab: SettingsTab): void;
}

export function PanelHeader({
  query,
  searchInputRef,
  menuTriggerRef,
  changeQuery,
  openSettings,
}: PanelHeaderProps) {
  return (
    <header className="grid gap-2 pt-4 pr-14 pb-3 pl-4">
      <div className="flex items-center gap-2">
        <SearchField
          query={query}
          inputRef={searchInputRef}
          onQueryChange={changeQuery}
        />
        <PanelPinButton />
        <PanelMenu
          openSettings={openSettings}
          triggerRef={menuTriggerRef}
        />
      </div>
      <TabsList
        aria-label="Note lifecycle view"
        className="h-auto w-fit gap-1"
      >
        <TabsTrigger
          value="active"
          aria-label="Active notes"
          className="h-7 px-3"
        >
          Active
        </TabsTrigger>
        <TabsTrigger
          value="completed"
          aria-label="Completed notes"
          className="h-7 px-3"
        >
          Completed
        </TabsTrigger>
      </TabsList>
    </header>
  );
}

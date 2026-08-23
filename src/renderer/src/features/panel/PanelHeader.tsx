import type { Ref } from "react";

import {
  ToggleGroup,
  ToggleGroupItem,
} from "../../components/ui/toggle-group";
import type { SettingsTab } from "../settings/settingsRoute";
import { SearchField } from "../search/SearchField";
import type { NoteProjectionView } from "../search/projectNotes";
import { PanelMenu } from "./PanelMenu";
import { PanelPinButton } from "./PanelPinButton";

interface PanelHeaderProps {
  query: string;
  view: NoteProjectionView;
  searchInputRef: Ref<HTMLInputElement>;
  menuTriggerRef: Ref<HTMLButtonElement>;
  changeQuery(query: string): void;
  changeView(view: NoteProjectionView): void;
  openSettings(tab: SettingsTab): void;
}

export function PanelHeader({
  query,
  view,
  searchInputRef,
  menuTriggerRef,
  changeQuery,
  changeView,
  openSettings,
}: PanelHeaderProps) {
  return (
    <header className="grid gap-2 px-4 pt-4 pb-3">
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
      <ToggleGroup
        type="single"
        value={view}
        aria-label="Note lifecycle view"
        className="rounded-lg border-0 bg-card/60"
        onValueChange={(nextView) => {
          if (nextView === "active" || nextView === "completed") {
            changeView(nextView);
          }
        }}
      >
        <ToggleGroupItem
          value="active"
          aria-label="Active notes"
          className="h-6 px-3 text-xs"
        >
          Active
        </ToggleGroupItem>
        <ToggleGroupItem
          value="completed"
          aria-label="Completed notes"
          className="h-6 px-3 text-xs"
        >
          Completed
        </ToggleGroupItem>
      </ToggleGroup>
    </header>
  );
}

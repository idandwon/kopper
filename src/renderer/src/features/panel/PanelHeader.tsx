import type { Ref } from "react";

import { Button } from "../../components/ui/button";
import type { SettingsTab } from "../settings/settingsRoute";
import { SearchField } from "../search/SearchField";
import type { NoteProjectionView } from "../search/projectNotes";
import { PanelMenu } from "./PanelMenu";

interface LifecycleViewButtonProps {
  view: NoteProjectionView;
  currentView: NoteProjectionView;
  selectView(view: NoteProjectionView): void;
}

function LifecycleViewButton({
  view,
  currentView,
  selectView,
}: LifecycleViewButtonProps) {
  const active = view === currentView;
  const label = view === "active" ? "Active notes" : "Completed notes";
  const visibleLabel = view === "active" ? "Active" : "Completed";

  return (
    <Button
      type="button"
      size="xs"
      variant={active ? "secondary" : "ghost"}
      aria-label={label}
      aria-pressed={active}
      onClick={() => selectView(view)}
    >
      {visibleLabel}
    </Button>
  );
}

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
    <header className="grid gap-2 px-4 pt-4 pb-3 pl-5">
      <div className="flex items-center gap-2">
        <SearchField
          query={query}
          inputRef={searchInputRef}
          onQueryChange={changeQuery}
        />
        <PanelMenu
          openSettings={openSettings}
          triggerRef={menuTriggerRef}
        />
      </div>
      <div
        role="group"
        className="flex w-fit rounded-lg bg-card/60 p-0.5"
        aria-label="Note lifecycle view"
      >
        <LifecycleViewButton
          view="active"
          currentView={view}
          selectView={changeView}
        />
        <LifecycleViewButton
          view="completed"
          currentView={view}
          selectView={changeView}
        />
      </div>
    </header>
  );
}

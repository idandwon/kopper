import { useRef } from "react";

import { useKopperDocument } from "../../app/DocumentProvider";
import { Button } from "../../components/ui/button";
import { SearchField } from "../search/SearchField";
import type { NoteProjectionView } from "../search/projectNotes";
import { PanelMenu } from "./PanelMenu";
import { PanelShortcuts } from "./PanelShortcuts";

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
  captureUnavailable: boolean;
  changeQuery(query: string): void;
  changeView(view: NoteProjectionView): void;
}

export function PanelHeader({
  query,
  view,
  captureUnavailable,
  changeQuery,
  changeView,
}: PanelHeaderProps) {
  const { pendingAction, undo } = useKopperDocument();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const busy = pendingAction !== null;

  const focusSearch = () => {
    searchInputRef.current?.focus();
  };

  const undoLastAction = () => {
    void undo();
  };

  return (
    <header className="grid gap-2 px-4 pt-4 pb-3 pl-5">
      <div className="flex items-center gap-2">
        <SearchField
          query={query}
          inputRef={searchInputRef}
          onQueryChange={changeQuery}
        />
        <PanelMenu captureUnavailable={captureUnavailable} />
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
      <PanelShortcuts
        disabled={busy}
        focusSearch={focusSearch}
        undo={undoLastAction}
      />
    </header>
  );
}

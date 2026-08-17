import { useKopperDocument } from "../../app/DocumentProvider";
import { Button } from "../../components/ui/button";
import { SearchField } from "../search/SearchField";
import type { NoteProjectionView } from "../search/projectNotes";
import { AddSectionDialog } from "../sections/SectionManager";
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
  const busy = pendingAction !== null;

  const undoLastAction = () => {
    void undo();
  };

  return (
    <header className="grid gap-2 px-4 pt-4 pb-3 pl-5">
      <SearchField query={query} onQueryChange={changeQuery} />
      <div className="flex items-center justify-between gap-2">
        <div
          role="group"
          className="flex rounded-lg border border-border bg-card p-0.5"
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
        <div className="flex items-center gap-1">
          <PanelMenu captureUnavailable={captureUnavailable} />
          <AddSectionDialog />
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={busy}
            onClick={undoLastAction}
          >
            Undo
          </Button>
        </div>
      </div>
    </header>
  );
}

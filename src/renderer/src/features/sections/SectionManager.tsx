import { useState, type FormEvent } from "react";

import type { Section } from "../../../../shared/domain/document";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { useKopperDocument } from "../../app/DocumentProvider";
import { useNotesSurfaceOverlay } from "../notes/NotesSurfaceVisibility";

function orderedSections(sections: Section[]): Section[] {
  return [...sections].sort((left, right) => left.order - right.order);
}

export interface SectionManagerProps {
  section: Section;
}

export function SectionManager({ section }: SectionManagerProps) {
  const { document, execute, pendingAction } = useKopperDocument();
  const sections = orderedSections(document.sections);
  const sectionIndex = sections.findIndex(({ id }) => id === section.id);
  const destinations = sections.filter(({ id }) => id !== section.id);
  const referenced =
    document.notes.some(
      (note) =>
        note.sectionId === section.id ||
        note.previousPlacement?.sectionId === section.id,
    ) || document.draft?.sectionId === section.id;
  const [menuOpen, setMenuOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [destinationOpen, setDestinationOpen] = useState(false);
  const [title, setTitle] = useState(section.title);
  const [destinationId, setDestinationId] = useState("");
  const menuOverlay = useNotesSurfaceOverlay(menuOpen, setMenuOpen);
  const tooltipOverlay = useNotesSurfaceOverlay(tooltipOpen, setTooltipOpen);
  const renameOverlay = useNotesSurfaceOverlay(renameOpen, setRenameOpen);
  const deleteOverlay = useNotesSurfaceOverlay(deleteOpen, setDeleteOpen);
  const destinationOverlay = useNotesSurfaceOverlay(
    destinationOpen,
    setDestinationOpen,
  );
  const selectedDestination = destinations.find(
    ({ id }) => id === destinationId,
  );
  const trimmedTitle = title.trim();

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    if (trimmedTitle.length === 0) return;
    if (
      await execute({
        type: "section.rename",
        sectionId: section.id,
        title: trimmedTitle,
      })
    ) {
      setRenameOpen(false);
    }
  };

  const remove = async () => {
    if (referenced && destinationId.length === 0) return;
    const acknowledged = await execute({
      type: "section.delete",
      sectionId: section.id,
      ...(destinationId.length > 0
        ? { destinationSectionId: destinationId }
        : {}),
    });
    if (acknowledged) {
      setDestinationId("");
      setDeleteOpen(false);
    }
  };

  return (
    <>
      <DropdownMenu {...menuOverlay}>
        <TooltipProvider>
          <Tooltip {...tooltipOverlay}>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Manage ${section.title}`}
                >
                  •••
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Manage {section.title}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setTitle(section.title);
              setRenameOpen(true);
            }}
          >
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={sectionIndex <= 0}
            onSelect={() =>
              void execute({
                type: "section.reorder",
                sectionId: section.id,
                destinationOrder: sectionIndex - 1,
              })
            }
          >
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={sectionIndex < 0 || sectionIndex >= sections.length - 1}
            onSelect={() =>
              void execute({
                type: "section.reorder",
                sectionId: section.id,
                destinationOrder: sectionIndex + 1,
              })
            }
          >
            Move down
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={sections.length === 1}
            className="text-destructive focus:text-destructive"
            onSelect={() => setDeleteOpen(true)}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog {...renameOverlay}>
        <DialogContent>
          <form onSubmit={(event) => void rename(event)} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Rename section</DialogTitle>
              <DialogDescription>Change the section heading.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor={`rename-section-${section.id}`}>
                Section name
              </Label>
              <Input
                id={`rename-section-${section.id}`}
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={trimmedTitle.length === 0 || pendingAction !== null}
              >
                Save name
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog {...deleteOverlay}>
        <AlertDialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void remove();
            }}
            className="grid gap-4"
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {section.title}?</AlertDialogTitle>
              <AlertDialogDescription>
                {referenced
                  ? "Choose where this section’s notes and draft should move."
                  : "This section is empty and can be deleted."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {referenced && (
              <div className="grid gap-1.5">
                <Label htmlFor={`delete-destination-${section.id}`}>
                  Move notes to
                </Label>
                <Select
                  {...destinationOverlay}
                  value={destinationId}
                  onValueChange={setDestinationId}
                >
                  <SelectTrigger
                    id={`delete-destination-${section.id}`}
                    className="w-full min-w-0"
                  >
                    <SelectValue
                      placeholder="Select a section"
                      title={selectedDestination?.title}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {destinations.map((destination) => (
                      <SelectItem key={destination.id} value={destination.id}>
                        <span
                          className="block min-w-0 truncate"
                          title={destination.title}
                        >
                          {destination.title}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
              <AlertDialogAction
                type="submit"
                disabled={
                  (referenced && destinationId.length === 0) ||
                  pendingAction !== null
                }
                onClick={(event) => {
                  event.preventDefault();
                  void remove();
                }}
              >
                Delete section
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

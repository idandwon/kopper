import { useState, type FormEvent } from "react";

import { useKopperDocument } from "../../app/DocumentProvider";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useNotesSurfaceOverlay } from "../notes/NotesSurfaceVisibility";

type AddSectionDialogProps =
  | { mode?: "trigger" }
  | {
      mode: "controlled";
      open: boolean;
      onOpenChange(open: boolean): void;
    };

export function AddSectionDialog(props: AddSectionDialogProps = {}) {
  const { execute, pendingAction } = useKopperDocument();
  const [internalOpen, setInternalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const controlled = props.mode === "controlled";
  const open = controlled ? props.open : internalOpen;
  const changeOpen = controlled ? props.onOpenChange : setInternalOpen;
  const dialogOverlay = useNotesSurfaceOverlay(open, changeOpen);
  const trimmedTitle = title.trim();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (trimmedTitle.length === 0) return;
    if (!(await execute({ type: "section.add", title: trimmedTitle }))) return;
    setTitle("");
    changeOpen(false);
  };

  return (
    <Dialog {...dialogOverlay}>
      {controlled ? null : (
        <DialogTrigger asChild>
          <Button type="button" variant="ghost" size="sm">
            Add section
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <form onSubmit={(event) => void submit(event)} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add section</DialogTitle>
            <DialogDescription>
              Create another place for active notes.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="new-section-name">Section name</Label>
            <Input
              id="new-section-name"
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
              Create section
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

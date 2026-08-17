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
  const trimmedTitle = title.trim();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (trimmedTitle.length === 0) return;
    if (!(await execute({ type: "section.add", title: trimmedTitle }))) return;
    setTitle("");
    changeOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      {controlled ? null : (
        <DialogTrigger asChild>
          <Button type="button" variant="ghost" size="xs">
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
          <label className="grid gap-1.5 text-sm">
            <span>Section name</span>
            <Input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          </label>
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

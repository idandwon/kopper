import { useState } from "react";

import type { KopperApi, DataImportPreview } from "../../../../shared/ipc/contract";
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

export function DataSettings({
  api = window.kopper,
}: {
  api?: Pick<KopperApi, "exportData" | "chooseDataImport" | "confirmDataImport">;
}) {
  const [preview, setPreview] = useState<DataImportPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const exportData = async () => {
    setBusy(true);
    try {
      const result = await api.exportData();
      setMessage(
        result.ok
          ? result.value.cancelled
            ? "Export cancelled."
            : `Exported ${result.value.fileName ?? "Kopper data"}.`
          : result.error.message,
      );
    } finally {
      setBusy(false);
    }
  };

  const chooseImport = async () => {
    setBusy(true);
    try {
      const result = await api.chooseDataImport();
      if (!result.ok) {
        setMessage(result.error.message);
      } else if (result.value === null) {
        setMessage("Import cancelled.");
      } else {
        setPreview(result.value);
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = async () => {
    if (preview === null) return;
    const token = preview.token;
    setPreview(null);
    setBusy(true);
    try {
      const result = await api.confirmDataImport(token);
      setMessage(result.ok ? "Import complete." : result.error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="grid gap-3" aria-labelledby="data-settings-title">
      <div>
        <h2 id="data-settings-title" className="m-0 text-sm font-semibold">
          Data files
        </h2>
        <p className="m-0 text-xs text-muted-foreground">
          Export a snapshot or replace this store from a validated Kopper file.
        </p>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void exportData()}>
          Export data
        </Button>
        <Button type="button" size="sm" disabled={busy} onClick={() => void chooseImport()}>
          Import data
        </Button>
      </div>
      {message !== null && <p role="status" className="m-0 text-xs">{message}</p>}

      <AlertDialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace current data?</AlertDialogTitle>
            <AlertDialogDescription>
              {preview === null
                ? "Review the selected file."
                : `${preview.fileName} contains ${preview.noteCount} notes and ${preview.sectionCount} sections. This replaces the current store.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmImport()}>
              Replace current data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

import { useEffect, useState } from "react";

import type { KopperError } from "../../../../shared/domain/errors";
import type { DataImportPreview, KopperApi } from "../../../../shared/ipc/contract";
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
import { ScrollArea } from "../../components/ui/scroll-area";
import { PanelShell } from "../panel/PanelShell";

export type RecoveryApi = Pick<
  KopperApi,
  | "getDataPath"
  | "chooseDataImport"
  | "confirmDataImport"
  | "exportRecoveryBytes"
  | "createNewStore"
>;

interface RecoveryOverviewProps {
  activePath: string;
  busy: boolean;
  error: KopperError;
  message: string | null;
  chooseImport(): void;
  createStore(): void;
  exportDamaged(): void;
}

function RecoveryOverview({
  activePath,
  busy,
  error,
  message,
  chooseImport,
  createStore,
  exportDamaged,
}: RecoveryOverviewProps) {
  return (
    <ScrollArea
      data-scroll-owner="recovery"
      className="min-h-0 min-w-0 flex-1"
      aria-label="Recovery options"
    >
      <div className="flex min-h-full min-w-0 items-center p-5 pl-6">
        <section className="grid w-full min-w-0 gap-4 rounded-xl border border-destructive bg-card p-5">
          <div>
            <h1 className="m-0 text-lg font-semibold">
              Kopper data needs recovery
            </h1>
            <p role="alert" className="mt-2 mb-0 text-sm">
              {error.message}
            </p>
          </div>
          <div className="grid min-w-0 gap-1 text-sm">
            <span className="font-medium">Active data path</span>
            <code className="min-w-0 break-all rounded bg-muted p-2 text-xs">
              {activePath}
            </code>
            <p className="m-0 text-xs text-muted-foreground">
              Kopper will not overwrite this damaged file automatically. Export
              it unchanged before replacing it if you may need the original
              bytes.
            </p>
          </div>
          <div className="grid min-w-0 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-auto min-w-0 whitespace-normal"
              disabled={busy}
              onClick={chooseImport}
            >
              Choose another file
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto min-w-0 whitespace-normal"
              disabled={busy}
              onClick={exportDamaged}
            >
              Export damaged content
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-auto min-w-0 whitespace-normal"
              disabled={busy}
              onClick={createStore}
            >
              Create new store
            </Button>
          </div>
          {message === null ? null : (
            <p role="status" className="m-0 text-sm">
              {message}
            </p>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}

export function RecoveryScreen({
  error,
  api = window.kopper,
}: {
  error: KopperError;
  api?: RecoveryApi;
}) {
  const [activePath, setActivePath] = useState("Loading active path…");
  const [preview, setPreview] = useState<DataImportPreview | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const lifecycle = new AbortController();
    void api.getDataPath().then((result) => {
      if (lifecycle.signal.aborted) return;
      setActivePath(result.ok ? result.value : "Active path unavailable");
    });
    return () => lifecycle.abort();
  }, [api]);

  const chooseImport = async () => {
    setBusy(true);
    try {
      const result = await api.chooseDataImport();
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      if (result.value === null) {
        setMessage("Import cancelled.");
        return;
      }
      setPreview(result.value);
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
      setMessage(result.ok ? "Recovery import complete." : result.error.message);
    } finally {
      setBusy(false);
    }
  };

  const exportDamaged = async () => {
    setBusy(true);
    try {
      const result = await api.exportRecoveryBytes();
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      if (result.value.cancelled) {
        setMessage("Damaged-content export cancelled.");
        return;
      }
      setMessage(
        `Exported ${result.value.fileName ?? "damaged content"} unchanged.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const createStore = async () => {
    setCreateOpen(false);
    setBusy(true);
    try {
      const result = await api.createNewStore();
      setMessage(result.ok ? "New store created." : result.error.message);
    } finally {
      setBusy(false);
    }
  };

  const closeImportPreview = (open: boolean) => {
    if (open) return;
    setPreview(null);
  };
  const importDescription =
    preview === null
      ? "Review the selected recovery file."
      : `${preview.fileName} contains ${preview.noteCount} notes and ${preview.sectionCount} sections. It will replace the active damaged store.`;

  return (
    <PanelShell>
      <RecoveryOverview
        activePath={activePath}
        busy={busy}
        error={error}
        message={message}
        chooseImport={() => void chooseImport()}
        createStore={() => setCreateOpen(true)}
        exportDamaged={() => void exportDamaged()}
      />

      <AlertDialog open={preview !== null} onOpenChange={closeImportPreview}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import this recovery file?</AlertDialogTitle>
            <AlertDialogDescription>{importDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmImport()}>
              Confirm recovery import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={createOpen} onOpenChange={setCreateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create a new empty store?</AlertDialogTitle>
            <AlertDialogDescription>
              This explicitly replaces the damaged file at{" "}
              <span className="break-all">{activePath}</span>. This action is
              not automatic.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void createStore()}>
              Confirm create new store
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PanelShell>
  );
}

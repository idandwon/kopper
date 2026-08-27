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
import { Separator } from "../../components/ui/separator";
import {
  SettingsFeedback,
  type SettingsFeedbackValue,
} from "./SettingsFeedback";
import { SettingsSection } from "./SettingsSection";

export function DataSettings({
  api = window.kopper,
}: {
  api?: Pick<KopperApi, "exportData" | "chooseDataImport" | "confirmDataImport">;
}) {
  const [preview, setPreview] = useState<DataImportPreview | null>(null);
  const [feedback, setFeedback] = useState<SettingsFeedbackValue | null>(null);
  const [busy, setBusy] = useState(false);

  const exportData = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await api.exportData();
      setFeedback(
        result.ok
          ? {
              text: result.value.cancelled
                ? "Export cancelled."
                : `Exported ${result.value.fileName ?? "Kopper data"}.`,
              tone: "status",
            }
          : { text: result.error.message, tone: "error" },
      );
    } catch {
      setFeedback({ text: "Data export could not run.", tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const chooseImport = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await api.chooseDataImport();
      if (!result.ok) {
        setFeedback({ text: result.error.message, tone: "error" });
      } else if (result.value === null) {
        setFeedback({ text: "Import cancelled.", tone: "status" });
      } else {
        setPreview(result.value);
      }
    } catch {
      setFeedback({ text: "Data import could not be opened.", tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = async () => {
    if (preview === null) return;
    const token = preview.token;
    setPreview(null);
    setBusy(true);
    setFeedback(null);
    try {
      const result = await api.confirmDataImport(token);
      setFeedback(
        result.ok
          ? { text: "Import complete.", tone: "status" }
          : { text: result.error.message, tone: "error" },
      );
    } catch {
      setFeedback({ text: "Data import could not be completed.", tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection
      title="Data files"
      description="Export a snapshot or replace this store from a validated Kopper file."
      headingId="data-settings-title"
      separated
      className="min-w-0 gap-5"
    >
      <div className="flex min-w-0 flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void exportData()}>
          Export data
        </Button>
        <Button type="button" size="sm" disabled={busy} onClick={() => void chooseImport()}>
          Import data
        </Button>
      </div>
      <SettingsFeedback
        value={feedback}
        onDismiss={() => setFeedback(null)}
      />

      <AlertDialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace current data?</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {preview === null
                ? "Review the selected file."
                : `${preview.fileName} contains ${preview.noteCount} notes and ${preview.sectionCount} sections. This replaces the current store.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-wrap">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmImport()}>
              Replace current data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}

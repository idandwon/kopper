import { useState } from "react";

import type { KopperApi, ThemeImportPreview } from "../../../../shared/ipc/contract";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { useTheme } from "../../theme/ThemeProvider";

function ModePreview({ mode, preview }: { mode: "light" | "dark"; preview: ThemeImportPreview }) {
  const tokens = preview.theme[mode];
  const derived = preview.derivedTokens[mode];
  return (
    <section className="grid gap-2 border-t border-border py-3" aria-labelledby={`import-${mode}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 id={`import-${mode}`} className="m-0 font-mono text-xs font-semibold capitalize">{mode}</h3>
        <span className="text-[11px] text-muted-foreground">Readable · contrast checked</span>
      </div>
      <div className="flex gap-1.5" aria-label={`${mode} theme swatches`}>
        {["background", "foreground", "primary", "accent", "capture", "completed"].map((token) => (
          <span key={token} title={`${token}: ${tokens[token as keyof typeof tokens]}`} className="h-5 flex-1 border border-border" style={{ backgroundColor: tokens[token as keyof typeof tokens] }} />
        ))}
      </div>
      <p className="m-0 text-[11px] text-muted-foreground">Derived lifecycle tokens: {derived.length === 0 ? "None" : derived.join(", ")}</p>
    </section>
  );
}

export function ThemeImportDialog({ api = window.kopper }: { api?: Pick<KopperApi, "importTheme"> }) {
  const { previewTheme, cancelPreview, savePreview } = useTheme();
  const [preview, setPreview] = useState<ThemeImportPreview | null>(null);
  const [didPreview, setDidPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const chooseImport = async () => {
    setBusy(true);
    setMessage(null);
    setError(false);
    try {
      const result = await api.importTheme();
      if (!result.ok) {
        setError(true);
        setMessage(result.error.message);
      } else if (result.value !== null) setPreview(result.value);
    } catch {
      setError(true);
      setMessage("The theme import response was invalid.");
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (didPreview) cancelPreview();
    setDidPreview(false);
    setPreview(null);
  };

  const applyPreview = () => {
    if (preview === null) return;
    previewTheme(preview.theme);
    setDidPreview(true);
  };

  const save = async () => {
    if (preview === null) return;
    setBusy(true);
    const saved = await savePreview(preview.theme);
    setBusy(false);
    if (saved) {
      setDidPreview(false);
      setPreview(null);
      setMessage(`${preview.theme.name} saved and activated. Export is now available.`);
    } else {
      setMessage("The imported theme could not be saved. The preview remains available.");
    }
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void chooseImport()}>Import theme</Button>
      {message !== null && <p role={error ? "alert" : "status"} className="m-0 text-[11px] text-muted-foreground">{message}</p>}
      <Dialog open={preview !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{preview?.theme.name ?? "Imported theme"}</DialogTitle>
            <DialogDescription>Validated preview only. Nothing is persisted until you save.</DialogDescription>
          </DialogHeader>
          {preview !== null && <div><ModePreview mode="light" preview={preview} /><ModePreview mode="dark" preview={preview} /></div>}
          <DialogFooter>
            <Button type="button" size="sm" variant="ghost" onClick={close}>Cancel</Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={applyPreview}>Preview</Button>
            <Button type="button" size="sm" disabled={busy} onClick={() => void save()}>Save imported theme</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

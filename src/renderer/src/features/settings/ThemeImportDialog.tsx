import { useState } from "react";

import type { KopperApi, ThemeImportPreview } from "../../../../shared/ipc/contract";
import { measureThemeContrast } from "../../../../shared/theme/deriveTheme";
import { THEME_FILE_SCHEMA_URL } from "../../../../shared/theme/themeSchema";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { useTheme } from "../../theme/ThemeProvider";

function ModePreview({ mode, preview }: { mode: "light" | "dark"; preview: ThemeImportPreview }) {
  const tokens = preview.theme[mode];
  const derived = preview.derivedTokens[mode];
  const measured = measureThemeContrast({
    $schema: THEME_FILE_SCHEMA_URL,
    version: 1,
    name: preview.theme.name,
    light: preview.theme.light,
    dark: preview.theme.dark,
  }).measurements.filter((measurement) => measurement.mode === mode);
  return (
    <section className="grid gap-2 border-t border-border py-3" aria-labelledby={`import-${mode}`}>
      <h3 id={`import-${mode}`} className="m-0 font-mono text-xs font-semibold capitalize">{mode}</h3>
      <ul className="m-0 grid list-none gap-1 p-0 text-[11px] text-muted-foreground" aria-label={`${mode} contrast measurements`}>
        {measured.map(({ backgroundToken, foregroundToken, ratio, meetsMinimum }) => (
          <li key={`${backgroundToken}:${foregroundToken}`}>
            {backgroundToken} / {foregroundToken}: {ratio}:1 contrast · {meetsMinimum ? "Pass" : "Fail"}
          </li>
        ))}
      </ul>
      <ul className="m-0 grid list-none grid-cols-2 gap-1.5 p-0" aria-label={`${mode} theme swatches`}>
        {(["background", "foreground", "primary", "accent", "capture", "completed"] as const).map((token) => (
          <li key={token} className="flex min-w-0 items-center gap-1.5 font-mono text-[10px]">
            <span aria-hidden="true" className="h-5 w-5 shrink-0 border border-border" style={{ backgroundColor: tokens[token] }} />
            <span className="truncate">{token}: {tokens[token]}</span>
          </li>
        ))}
      </ul>
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
    if (busy) return;
    if (didPreview) cancelPreview();
    setDidPreview(false);
    setPreview(null);
  };

  const applyPreview = () => {
    if (preview === null || busy) return;
    previewTheme(preview.theme);
    setDidPreview(true);
  };

  const save = async () => {
    if (preview === null || busy) return;
    setBusy(true);
    setError(false);
    const result = await savePreview(preview.theme);
    setBusy(false);
    switch (result.status) {
      case "saved":
        setDidPreview(false);
        setPreview(null);
        setMessage(`${preview.theme.name} saved and activated. Export is now available.`);
        return;
      case "upsert_failed":
        setError(true);
        setMessage("The imported theme was not saved. The preview remains available.");
        return;
      case "activation_failed":
        setError(true);
        setMessage("The imported theme was saved, but could not be activated. The preview remains available so you can retry.");
        return;
    }
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void chooseImport()}>Import theme</Button>
      {message !== null && preview === null && <p role={error ? "alert" : "status"} className="m-0 text-[11px] text-muted-foreground">{message}</p>}
      <Dialog open={preview !== null} onOpenChange={(open) => !open && !busy && close()}>
        <DialogContent
          closeDisabled={busy}
          onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
          onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}
          onInteractOutside={(event) => { if (busy) event.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle>{preview?.theme.name ?? "Imported theme"}</DialogTitle>
            <DialogDescription>Validated preview only. Nothing is persisted until you save.</DialogDescription>
          </DialogHeader>
          {message !== null && <p role={error ? "alert" : "status"} className="m-0 text-[11px] text-muted-foreground">{message}</p>}
          {preview !== null && <div><ModePreview mode="light" preview={preview} /><ModePreview mode="dark" preview={preview} /></div>}
          <DialogFooter>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={close}>Cancel</Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={applyPreview}>Preview</Button>
            <Button type="button" size="sm" disabled={busy} onClick={() => void save()}>Save imported theme</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

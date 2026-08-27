import { useEffect, useState } from "react";

import type { KopperError } from "../../../../shared/domain/errors";
import type { KopperApi, ThemeImportPreview } from "../../../../shared/ipc/contract";
import { measureThemeContrast } from "../../../../shared/theme/deriveTheme";
import { THEME_FILE_SCHEMA_URL } from "../../../../shared/theme/themeSchema";
import type { ShadcnThemeToken } from "../../../../shared/theme/tokens";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Separator } from "../../components/ui/separator";
import {
  useTheme,
  type ThemePreviewOwner,
} from "../../theme/ThemeProvider";

const PREVIEW_TOKENS: readonly ShadcnThemeToken[] = [
  "background",
  "foreground",
  "card",
  "primary",
  "accent",
  "muted",
];

function ModePreview({ mode, preview }: { mode: "light" | "dark"; preview: ThemeImportPreview }) {
  const tokens = preview.theme[mode];
  const normalized = preview.normalizedTokens[mode];
  const measured = measureThemeContrast({
    $schema: THEME_FILE_SCHEMA_URL,
    version: 1,
    name: preview.theme.name,
    light: preview.theme.light,
    dark: preview.theme.dark,
  }).measurements.filter((measurement) => measurement.mode === mode);
  return (
    <section className="grid min-w-0 gap-2 py-3" aria-labelledby={`import-${mode}`}>
      <Separator />
      <h3 id={`import-${mode}`} className="m-0 font-mono text-xs font-semibold capitalize">{mode}</h3>
      <ul className="m-0 grid list-none gap-1 p-0 text-xs text-muted-foreground" aria-label={`${mode} contrast measurements`}>
        {measured.map(({ backgroundToken, foregroundToken, ratio, meetsMinimum }) => (
          <li
            key={`${backgroundToken}:${foregroundToken}`}
            className="break-words"
          >
            {backgroundToken} / {foregroundToken}: {ratio}:1 contrast · {meetsMinimum ? "Pass" : "Fail"}
          </li>
        ))}
      </ul>
      <ul className="m-0 grid min-w-0 list-none grid-cols-2 gap-1.5 p-0" aria-label={`${mode} theme swatches`}>
        {PREVIEW_TOKENS.map((token) => (
          <li key={token} className="flex min-w-0 items-center gap-1.5 font-mono text-xs">
            <span aria-hidden="true" className="h-5 w-5 shrink-0 border border-border" style={{ backgroundColor: tokens[token] }} />
            <span className="truncate">{token}: {tokens[token]}</span>
          </li>
        ))}
      </ul>
      <p className="m-0 break-words text-xs text-muted-foreground">Normalized to system defaults: {normalized.length === 0 ? "None" : normalized.join(", ")}</p>
    </section>
  );
}

export function ThemeImportDialog({ api = window.kopper }: { api?: Pick<KopperApi, "importTheme"> }) {
  const { previewTheme, cancelPreview, savePreview } = useTheme();
  const [previewOwner] = useState<ThemePreviewOwner>(() =>
    Symbol("theme import preview"),
  );
  const [preview, setPreview] = useState<ThemeImportPreview | null>(null);
  const [didPreview, setDidPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [importError, setImportError] = useState<KopperError | null>(null);

  useEffect(
    () => () => cancelPreview(previewOwner),
    [cancelPreview, previewOwner],
  );

  const chooseImport = async () => {
    setBusy(true);
    setMessage(null);
    setError(false);
    setImportError(null);
    try {
      const result = await api.importTheme();
      if (!result.ok) {
        setError(true);
        setImportError(result.error);
        setMessage(result.error.message);
      } else if (result.value !== null) setPreview(result.value);
    } catch {
      setError(true);
      setImportError(null);
      setMessage("The theme import response was invalid.");
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (busy) return;
    if (didPreview) cancelPreview(previewOwner);
    setDidPreview(false);
    setPreview(null);
  };

  const applyPreview = () => {
    if (preview === null || busy) return;
    previewTheme(previewOwner, preview.theme);
    setDidPreview(true);
  };

  const save = async () => {
    if (preview === null || busy) return;
    setBusy(true);
    setError(false);
    const result = await savePreview(previewOwner, preview.theme);
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
      {message !== null && preview === null && (
        <Alert
          role={error ? "alert" : "status"}
          variant={error ? "destructive" : "default"}
          className="min-w-0"
        >
          <AlertDescription className="break-words">
          <p className="m-0">{message}</p>
          {importError?.failures !== undefined && importError.failures.length > 0 && (
            <ul className="m-0 list-disc pl-5">
              {importError.failures.map((failure) => (
                <li key={`${failure.mode}:${failure.backgroundToken}:${failure.foregroundToken}`}>
                  {failure.mode}: {failure.backgroundToken} / {failure.foregroundToken} — {failure.ratio}:1; minimum 4.5:1
                </li>
              ))}
            </ul>
          )}
          {importError?.opaqueBackgroundModes?.map((mode) => (
            <p className="m-0" key={mode}>{mode}: background must be opaque.</p>
          ))}
          </AlertDescription>
        </Alert>
      )}
      <Dialog open={preview !== null} onOpenChange={(open) => !open && !busy && close()}>
        <DialogContent
          closeDisabled={busy}
          onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
          onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}
          onInteractOutside={(event) => { if (busy) event.preventDefault(); }}
        >
          <DialogHeader className="min-w-0 pr-8">
            <DialogTitle className="break-words">{preview?.theme.name ?? "Imported theme"}</DialogTitle>
            <DialogDescription className="break-words">Validated preview only. Nothing is persisted until you save.</DialogDescription>
          </DialogHeader>
          {message !== null && (
            <Alert role={error ? "alert" : "status"} variant={error ? "destructive" : "default"}>
              <AlertDescription className="break-words">{message}</AlertDescription>
            </Alert>
          )}
          {preview !== null && <div className="min-w-0"><ModePreview mode="light" preview={preview} /><ModePreview mode="dark" preview={preview} /></div>}
          <DialogFooter className="flex-wrap">
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={close}>Cancel</Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={applyPreview}>Preview</Button>
            <Button type="button" size="sm" disabled={busy} onClick={() => void save()}>Save imported theme</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

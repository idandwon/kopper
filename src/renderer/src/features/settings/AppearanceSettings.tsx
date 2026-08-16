import { useState } from "react";

import type { ThemeDefinition } from "../../../../shared/domain/document";
import { BUNDLED_THEMES } from "../../../../shared/theme/presets";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useKopperDocument } from "../../app/DocumentProvider";
import { useTheme } from "../../theme/ThemeProvider";
import { ThemeEditor } from "./ThemeEditor";
import { ThemeImportDialog } from "./ThemeImportDialog";

export function AppearanceSettings() {
  const { document, execute, pendingAction } = useKopperDocument();
  const { resolvedMode } = useTheme();
  const [editing, setEditing] = useState<ThemeDefinition | null>(null);
  const [deleteTheme, setDeleteTheme] = useState<ThemeDefinition | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [modePending, setModePending] = useState(false);
  const busy = pendingAction !== null || modePending;
  const themes = [...BUNDLED_THEMES, ...document.customThemes];

  const changeMode = async (mode: "system" | "light" | "dark") => {
    if (busy) return;
    setMessage(null);
    setModePending(true);
    const changed = await execute({ type: "appearance.setMode", mode });
    setModePending(false);
    setMessage(changed ? `Appearance mode changed to ${mode}.` : "Appearance mode could not be changed.");
  };

  const activate = async (themeId: string) => {
    setMessage(null);
    const saved = await execute({ type: "appearance.setActiveTheme", themeId });
    setMessage(saved ? "Theme activated." : "Theme activation failed.");
  };

  const exportTheme = async (themeId: string) => {
    setMessage(null);
    try {
      const result = await window.kopper.exportTheme(themeId);
      setMessage(result.ok ? (result.value === null ? "Export cancelled." : "Theme exported.") : result.error.message);
    } catch {
      setMessage("Theme export failed.");
    }
  };

  const removeTheme = async () => {
    if (deleteTheme === null) return;
    const deleted = await execute({ type: "appearance.deleteCustomTheme", themeId: deleteTheme.id });
    setMessage(deleted ? "Custom theme deleted." : "Custom theme could not be deleted.");
    if (deleted) setDeleteTheme(null);
  };

  return (
    <section className="grid gap-5" aria-labelledby="appearance-settings-title">
      <div>
        <h2 id="appearance-settings-title" className="m-0 text-sm font-semibold">Appearance</h2>
        <p className="m-0 text-xs text-muted-foreground">Choose a mode and a complete semantic theme.</p>
      </div>

      <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-y border-border py-3">
        <div><p className="m-0 text-xs font-medium">Color mode</p><p className="m-0 text-[11px] text-muted-foreground">System follows the current macOS appearance.</p></div>
        <Select value={document.appearance.mode} disabled={busy} onValueChange={(mode) => void changeMode(mode as "system" | "light" | "dark")}>
          <SelectTrigger aria-label="Appearance mode"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="system">System</SelectItem><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem></SelectContent>
        </Select>
      </div>
      <p role="status" aria-live="polite" className="sr-only">Selected {document.appearance.mode} appearance; currently resolved to {resolvedMode}.</p>

      <div className="grid gap-1">
        <h3 className="m-0 font-mono text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Themes</h3>
        <div className="divide-y divide-border border-y border-border">
          {themes.map((theme) => {
            const active = theme.id === document.appearance.activeThemeId;
            const custom = document.customThemes.some(({ id }) => id === theme.id);
            return (
              <div key={theme.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-2">
                <div className="min-w-0"><p className="m-0 truncate text-xs font-medium">{theme.name}</p><p className="m-0 truncate font-mono text-[10px] text-muted-foreground">{theme.id}</p></div>
                <div className="flex items-center gap-1">
                  <Button type="button" size="xs" variant={active ? "secondary" : "ghost"} aria-label={`${active ? "Active" : "Activate"} ${theme.name}`} aria-pressed={active} disabled={busy || active} onClick={() => void activate(theme.id)}>{active ? "Active" : "Activate"}</Button>
                  <Button type="button" size="xs" variant="ghost" aria-label={`${custom ? "Edit" : "Customize"} ${theme.name}`} disabled={busy} onClick={() => setEditing(theme)}>{custom ? "Edit" : "Customize"}</Button>
                  <Button type="button" size="xs" variant="ghost" aria-label={`Export ${theme.name}`} disabled={busy} onClick={() => void exportTheme(theme.id)}>Export</Button>
                  {custom && <Button type="button" size="xs" variant="ghost" aria-label={`Delete ${theme.name}`} disabled={busy} onClick={() => setDeleteTheme(theme)}>Delete</Button>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2"><ThemeImportDialog />{message !== null && <p role="status" className="m-0 text-[11px] text-muted-foreground">{message}</p>}</div>

      {editing !== null && <ThemeEditor key={editing.id} baseTheme={editing} custom={document.customThemes.some(({ id }) => id === editing.id)} open onOpenChange={(open) => !open && setEditing(null)} />}
      <AlertDialog open={deleteTheme !== null} onOpenChange={(open) => !open && setDeleteTheme(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete custom theme?</AlertDialogTitle><AlertDialogDescription>{deleteTheme === null ? "This cannot be undone." : `${deleteTheme.name} will be removed. If active, Oxide Ledger becomes active.`}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void removeTheme()}>Delete theme</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

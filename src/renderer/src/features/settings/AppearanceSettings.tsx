import { useState } from "react";

import type {
  AppearanceMode,
  ThemeDefinition,
} from "../../../../shared/domain/document";
import { BUNDLED_THEMES } from "../../../../shared/theme/presets";
import { useKopperDocument } from "../../app/DocumentProvider";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Separator } from "../../components/ui/separator";
import { useTheme } from "../../theme/ThemeProvider";
import {
  SettingsFeedback,
  type SettingsFeedbackValue,
} from "./SettingsFeedback";
import { ThemeEditor } from "./ThemeEditor";
import { ThemeImportDialog } from "./ThemeImportDialog";

export function parseAppearanceMode(value: string): AppearanceMode | null {
  if (value === "system" || value === "light" || value === "dark") {
    return value;
  }
  return null;
}

export function AppearanceSettings() {
  const { document, execute, pendingAction } = useKopperDocument();
  const { resolvedMode } = useTheme();
  const [editing, setEditing] = useState<ThemeDefinition | null>(null);
  const [deleteTheme, setDeleteTheme] = useState<ThemeDefinition | null>(null);
  const [feedback, setFeedback] = useState<SettingsFeedbackValue | null>(null);
  const [modePending, setModePending] = useState(false);
  const busy = pendingAction !== null || modePending;
  const themes = [...BUNDLED_THEMES, ...document.customThemes];

  const changeMode = async (mode: AppearanceMode) => {
    if (busy) return;
    setFeedback(null);
    setModePending(true);
    const changed = await execute({ type: "appearance.setMode", mode });
    setModePending(false);
    setFeedback({
      text: changed
        ? `Appearance mode changed to ${mode}.`
        : "Appearance mode could not be changed.",
      tone: changed ? "status" : "error",
    });
  };

  const selectMode = (value: string) => {
    const mode = parseAppearanceMode(value);
    if (mode === null) return;
    void changeMode(mode);
  };

  const activate = async (themeId: string) => {
    setFeedback(null);
    const saved = await execute({
      type: "appearance.setActiveTheme",
      themeId,
    });
    setFeedback({
      text: saved ? "Theme activated." : "Theme activation failed.",
      tone: saved ? "status" : "error",
    });
  };

  const exportTheme = async (themeId: string) => {
    setFeedback(null);
    try {
      const result = await window.kopper.exportTheme(themeId);
      if (!result.ok) {
        setFeedback({ text: result.error.message, tone: "error" });
        return;
      }
      setFeedback({
        text: result.value === null ? "Export cancelled." : "Theme exported.",
        tone: "status",
      });
    } catch {
      setFeedback({ text: "Theme export failed.", tone: "error" });
    }
  };

  const removeTheme = async () => {
    if (deleteTheme === null) return;
    const deleted = await execute({
      type: "appearance.deleteCustomTheme",
      themeId: deleteTheme.id,
    });
    setFeedback({
      text: deleted
        ? "Custom theme deleted."
        : "Custom theme could not be deleted.",
      tone: deleted ? "status" : "error",
    });
    if (deleted) setDeleteTheme(null);
  };

  return (
    <section
      className="grid min-w-0 gap-5"
      aria-labelledby="appearance-settings-title"
    >
      <div className="min-w-0">
        <h2
          id="appearance-settings-title"
          className="m-0 text-sm font-semibold"
        >
          Appearance
        </h2>
        <p className="m-0 break-words text-xs text-muted-foreground">
          Choose a mode and a complete semantic theme.
        </p>
      </div>

      <Separator />
      <div className="grid min-w-0 gap-2">
        <div className="min-w-0">
          <Label htmlFor="appearance-mode" className="text-xs">
            Color mode
          </Label>
          <p className="m-0 break-words text-[11px] text-muted-foreground">
            System follows the current macOS appearance.
          </p>
        </div>
        <Select
          value={document.appearance.mode}
          disabled={busy}
          onValueChange={selectMode}
        >
          <SelectTrigger
            id="appearance-mode"
            aria-label="Appearance mode"
            className="w-full min-w-0"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">System</SelectItem>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        Selected {document.appearance.mode} appearance; currently resolved to{" "}
        {resolvedMode}.
      </p>

      <Separator />
      <div className="grid min-w-0 gap-1">
        <h3 className="m-0 font-mono text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Themes
        </h3>
        <div className="min-w-0 divide-y divide-border border-y border-border">
          {themes.map((theme) => {
            const active = theme.id === document.appearance.activeThemeId;
            const custom = document.customThemes.some(
              ({ id }) => id === theme.id,
            );
            return (
              <div
                key={theme.id}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-2"
              >
                <div className="min-w-0">
                  <p className="m-0 break-words text-xs font-medium">
                    {theme.name}
                  </p>
                  <p className="m-0 break-all font-mono text-[10px] text-muted-foreground">
                    {theme.id}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="xs"
                    variant={active ? "secondary" : "ghost"}
                    aria-label={`${active ? "Active" : "Activate"} ${theme.name}`}
                    aria-pressed={active}
                    disabled={busy || active}
                    onClick={() => void activate(theme.id)}
                  >
                    {active ? "Active" : "Activate"}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        aria-label={`Actions for ${theme.name}`}
                        disabled={busy}
                      >
                        Actions
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(theme)}>
                        {custom ? "Edit" : "Customize"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => void exportTheme(theme.id)}
                      >
                        Export
                      </DropdownMenuItem>
                      {custom ? (
                        <DropdownMenuItem
                          onSelect={() => {
                            setFeedback(null);
                            setDeleteTheme(theme);
                          }}
                        >
                          Delete
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <ThemeImportDialog />
        {deleteTheme === null ? (
          <SettingsFeedback
            value={feedback}
            className="flex-1 text-[11px] text-muted-foreground"
            onDismiss={() => setFeedback(null)}
          />
        ) : null}
      </div>

      {editing !== null ? (
        <ThemeEditor
          key={editing.id}
          baseTheme={editing}
          custom={document.customThemes.some(({ id }) => id === editing.id)}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        />
      ) : null}
      <AlertDialog
        open={deleteTheme !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTheme(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete custom theme?</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {deleteTheme === null
                ? "This cannot be undone."
                : `${deleteTheme.name} will be removed. If active, Oxide Ledger becomes active.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <SettingsFeedback
            value={feedback}
            className="text-[11px] text-muted-foreground"
            persistent
            onDismiss={() => setFeedback(null)}
          />
          <AlertDialogFooter className="flex-wrap">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void removeTheme();
              }}
            >
              Delete theme
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

import { converter, formatHex, parse as parseColor } from "culori";
import { useEffect, useMemo, useRef, useState } from "react";

import { ThemeDefinitionSchema, type ThemeDefinition } from "../../../../shared/domain/document";
import { validateReadableTheme } from "../../../../shared/theme/deriveTheme";
import { CompleteThemeModeSchema, THEME_FILE_SCHEMA_URL } from "../../../../shared/theme/themeSchema";
import {
  KOPPER_THEME_TOKENS,
  SHADCN_THEME_TOKENS,
  type ThemeToken,
} from "../../../../shared/theme/tokens";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  useTheme,
  type ThemePreviewOwner,
} from "../../theme/ThemeProvider";

const TOKEN_GROUPS: ReadonlyArray<{ name: string; tokens: readonly ThemeToken[] }> = [
  { name: "Surface", tokens: ["background", "card", "popover", "secondary", "muted"] },
  { name: "Text", tokens: ["foreground", "card-foreground", "popover-foreground", "secondary-foreground", "muted-foreground"] },
  { name: "Action", tokens: ["primary", "primary-foreground", "accent", "accent-foreground", "ring"] },
  { name: "State", tokens: ["destructive", "destructive-foreground", "capture", "organized", "completed"] },
  { name: "Border", tokens: ["border", "input"] },
  { name: "Shape", tokens: ["radius"] },
];

type EditorMode = "light" | "dark";
type RawModes = Record<EditorMode, Record<ThemeToken, string>>;
type Validation = { valid: boolean; message: string; tokenMessages: Partial<Record<`${EditorMode}:${ThemeToken}`, string>> };

const toRgb = converter("rgb");
const THEME_TOKENS: readonly string[] = [
  ...SHADCN_THEME_TOKENS,
  ...KOPPER_THEME_TOKENS,
];

function isThemeToken(value: string): value is ThemeToken {
  return THEME_TOKENS.includes(value);
}

function parseEditorMode(value: string): EditorMode | null {
  return value === "light" || value === "dark" ? value : null;
}

function colorHex(value: string): string | null {
  const parsed = parseColor(value);
  if (parsed === undefined) return null;
  const rgb = toRgb(parsed);
  if (rgb === undefined || (rgb.alpha !== undefined && rgb.alpha !== 1)) return null;
  return formatHex(rgb);
}

function rawModes(theme: ThemeDefinition): RawModes {
  return {
    light: { ...theme.light },
    dark: { ...theme.dark },
  };
}

function candidateFromRaw(id: string, name: string, raw: RawModes) {
  return ThemeDefinitionSchema.safeParse({ id, name, version: 1, light: raw.light, dark: raw.dark });
}

function validateDraft(id: string, name: string, raw: RawModes): Validation {
  const parsed = candidateFromRaw(id, name, raw);
  if (!parsed.success) {
    const tokenMessages: Validation["tokenMessages"] = {};
    for (const issue of parsed.error.issues) {
      const [mode, token] = issue.path;
      if (
        (mode === "light" || mode === "dark") &&
        typeof token === "string" &&
        isThemeToken(token)
      ) {
        tokenMessages[`${mode}:${token}`] = issue.message;
      }
    }
    return { valid: false, message: "Fix invalid theme values before saving.", tokenMessages };
  }
  const readable = validateReadableTheme({
    $schema: THEME_FILE_SCHEMA_URL,
    version: 1,
    name: parsed.data.name,
    light: parsed.data.light,
    dark: parsed.data.dark,
  });
  if (readable.ok) return { valid: true, message: "Theme is readable in both modes.", tokenMessages: {} };

  const tokenMessages: Validation["tokenMessages"] = {};
  for (const failure of readable.error.failures) {
    const message = `Contrast ${failure.ratio}:1; 4.5:1 required.`;
    tokenMessages[`${failure.mode}:${failure.backgroundToken}`] = message;
    tokenMessages[`${failure.mode}:${failure.foregroundToken}`] = message;
  }
  for (const mode of readable.error.opaqueBackgroundModes) {
    tokenMessages[`${mode}:background`] = "The root background must be opaque.";
  }
  return { valid: false, message: readable.error.message, tokenMessages };
}

export function ThemeEditor({ baseTheme, custom, open, onOpenChange }: {
  baseTheme: ThemeDefinition;
  custom: boolean;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const immutableBaseRef = useRef(structuredClone(baseTheme));
  const initialThemeRef = useRef<ThemeDefinition | null>(null);
  if (initialThemeRef.current === null) {
    initialThemeRef.current = {
      ...structuredClone(baseTheme),
      id: custom ? baseTheme.id : globalThis.crypto.randomUUID(),
      name: custom ? baseTheme.name : `${baseTheme.name} Custom`,
    };
  }
  const initial = initialThemeRef.current;
  const { previewTheme, cancelPreview, savePreview } = useTheme();
  const [previewOwner] = useState<ThemePreviewOwner>(() =>
    Symbol("theme editor preview"),
  );
  const [mode, setMode] = useState<EditorMode>("light");
  const [name, setName] = useState(initial.name);
  const [draft, setDraft] = useState<ThemeDefinition>(() => structuredClone(initial));
  const [raw, setRaw] = useState<RawModes>(() => rawModes(initial));
  const [validation, setValidation] = useState<Validation>(() => validateDraft(initial.id, initial.name, rawModes(initial)));
  const [validating, setValidating] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const initialFingerprint = useRef(JSON.stringify({ name: initial.name, raw: rawModes(initial) }));
  const dirty = JSON.stringify({ name, raw }) !== initialFingerprint.current;

  useEffect(() => {
    setValidating(true);
    const timer = globalThis.setTimeout(() => {
      setValidation(validateDraft(initial.id, name, raw));
      setValidating(false);
    }, 150);
    return () => globalThis.clearTimeout(timer);
  }, [initial.id, name, raw]);

  useEffect(
    () => () => cancelPreview(previewOwner),
    [cancelPreview, previewOwner],
  );

  const updateToken = (token: ThemeToken, value: string) => {
    if (saving) return;
    const nextRaw = { ...raw, [mode]: { ...raw[mode], [token]: value } };
    setRaw(nextRaw);
    setMessage(null);
    // Parse this value against the last applied mode, not every raw field. An
    // incomplete sibling remains editable while an independently valid token
    // still reaches live preview immediately.
    const modeParsed = CompleteThemeModeSchema.safeParse({
      ...draft[mode],
      [token]: value,
    });
    if (modeParsed.success) {
      const next = { ...draft, [mode]: modeParsed.data };
      setDraft(next);
      previewTheme(previewOwner, next, mode);
    }
  };

  const resetToken = (token: ThemeToken) => {
    if (!saving) updateToken(token, immutableBaseRef.current[mode][token]);
  };

  const resetAll = () => {
    if (saving) return;
    const next: ThemeDefinition = {
      ...structuredClone(immutableBaseRef.current),
      id: initial.id,
      name: initial.name,
    };
    setName(next.name);
    setRaw(rawModes(next));
    setDraft(next);
    previewTheme(previewOwner, next, mode);
    setMessage(null);
  };

  const discardAndClose = () => {
    if (saving) return;
    cancelPreview(previewOwner);
    setConfirmClose(false);
    onOpenChange(false);
  };

  const requestClose = () => {
    if (saving) return;
    if (dirty) setConfirmClose(true);
    else discardAndClose();
  };

  const save = async () => {
    if (saving) return;
    const parsed = candidateFromRaw(initial.id, name, raw);
    const currentValidation = validateDraft(initial.id, name, raw);
    if (!parsed.success || !currentValidation.valid || !validation.valid || validating) return;
    setConfirmClose(false);
    setSaving(true);
    const result = await savePreview(previewOwner, parsed.data, mode);
    setSaving(false);
    switch (result.status) {
      case "saved":
        onOpenChange(false);
        return;
      case "upsert_failed":
        setMessage("Theme was not saved. Your changes are still open.");
        return;
      case "activation_failed":
        setMessage("Theme was saved, but could not be activated. Your preview remains open so you can retry.");
        return;
    }
  };

  const rows = useMemo(() => TOKEN_GROUPS.map((group) => (
    <section key={group.name} aria-labelledby={`theme-group-${group.name.toLowerCase()}`}>
      <h3 id={`theme-group-${group.name.toLowerCase()}`} className="sticky top-0 z-10 m-0 border-y border-border bg-background px-1 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.name}</h3>
      <div className="divide-y divide-border">
        {group.tokens.map((token) => {
          const value = raw[mode][token];
          const hex = token === "radius" ? null : colorHex(value);
          const problem = validation.tokenMessages[`${mode}:${token}`];
          const fieldId = `${mode}-${token}`;
          return (
            <div key={token} className="grid min-w-0 gap-1.5 px-1 py-2">
              <Label htmlFor={fieldId} className="text-xs">
                {token}
              </Label>
              <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-1.5">
                {hex === null ? null : (
                  <Input
                    type="color"
                    value={hex}
                    aria-label={`${token} color picker`}
                    disabled={saving}
                    onChange={(event) =>
                      updateToken(token, event.currentTarget.value)
                    }
                    className="size-8 p-1"
                  />
                )}
                <Input
                  id={fieldId}
                  value={value}
                  aria-invalid={problem !== undefined}
                  disabled={saving}
                  onChange={(event) =>
                    updateToken(token, event.currentTarget.value)
                  }
                  className="col-start-2 h-8 min-w-0 font-mono text-[11px]"
                />
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => resetToken(token)}
                  aria-label={`Reset ${token}`}
                >
                  Reset
                </Button>
              </div>
              {problem === undefined ? null : (
                <p
                  role="alert"
                  className="m-0 break-words text-[11px] text-destructive"
                >
                  {problem}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  )), [mode, raw, saving, validation]);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => !next && !saving && requestClose()}
      >
        <DialogContent
          closeDisabled={saving}
          onEscapeKeyDown={(event) => {
            if (saving) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (saving) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (saving) event.preventDefault();
          }}
          className="flex h-[92vh] max-h-[48rem] w-[calc(100vw-2rem)] max-w-xl flex-col gap-3 overflow-hidden p-4"
        >
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle>
              {custom ? "Edit custom theme" : "Customize theme"}
            </DialogTitle>
            <DialogDescription className="break-words">
              Changes preview immediately after each value becomes valid.
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-w-0 shrink-0 gap-1">
            <Label htmlFor="theme-name" className="text-xs">
              Theme name
            </Label>
            <Input
              id="theme-name"
              disabled={saving}
              value={name}
              onChange={(event) => {
                if (!saving) {
                  setName(event.currentTarget.value);
                  setMessage(null);
                }
              }}
            />
          </div>
          <Tabs
            value={mode}
            onValueChange={(value) => {
              if (saving) return;
              const nextMode = parseEditorMode(value);
              if (nextMode === null) return;
              setMode(nextMode);
              previewTheme(previewOwner, draft, nextMode);
            }}
            className="flex min-h-0 min-w-0 flex-1 flex-col"
          >
            <TabsList aria-label="Theme mode" className="shrink-0">
              <TabsTrigger disabled={saving} value="light">
                Light
              </TabsTrigger>
              <TabsTrigger disabled={saving} value="dark">
                Dark
              </TabsTrigger>
            </TabsList>
            <ScrollArea
              data-scroll-owner="theme-editor"
              aria-label="Theme tokens"
              className="min-h-0 min-w-0 flex-1 pr-1"
            >
              <TabsContent value="light" className="mt-0 min-w-0">
                {rows}
              </TabsContent>
              <TabsContent value="dark" className="mt-0 min-w-0">
                {rows}
              </TabsContent>
            </ScrollArea>
          </Tabs>
          <div className="flex min-w-0 shrink-0 flex-wrap items-start justify-between gap-3 border-t border-border pt-3">
            <div className="min-w-0 flex-1">
              <p
                role="status"
                aria-live="polite"
                className="m-0 break-words text-[11px] text-muted-foreground"
              >
                {validating ? "Validating…" : validation.message}
              </p>
              {message === null ? null : (
                <p
                  role="alert"
                  className="m-0 break-words text-[11px] text-destructive"
                >
                  {message}
                </p>
              )}
            </div>
            <DialogFooter className="flex-wrap">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={resetAll}
              >
                Reset all
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={requestClose}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving || validating || !validation.valid}
                onClick={() => void save()}
              >
                Save theme
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={confirmClose}
        onOpenChange={(next) => {
          if (!saving) setConfirmClose(next);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard theme changes?</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              Your unsaved values will be lost and the persisted theme will be
              restored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-wrap">
            <AlertDialogCancel disabled={saving}>Keep editing</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={discardAndClose}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

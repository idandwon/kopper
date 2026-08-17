import { useEffect, useState } from "react";

import {
  DEFAULT_SHORTCUT_PREFERENCES,
  type ShortcutPreferences,
} from "../../../../shared/domain/document";
import { useKopperDocument } from "../../app/DocumentProvider";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "../../components/ui/radio-group";
import { Separator } from "../../components/ui/separator";

function acceleratorFromEvent(event: KeyboardEvent): string | null {
  if (["Meta", "Control", "Alt", "Shift"].includes(event.key)) return null;
  const modifiers: string[] = [];
  if (event.metaKey) modifiers.push("Command");
  if (event.ctrlKey) modifiers.push("Control");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (modifiers.length === 0) return null;
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  return [...modifiers, key === " " ? "Space" : key].join("+");
}

function shortcutFingerprint(preferences: ShortcutPreferences): string {
  const capture =
    preferences.capture.kind === "double-modifier"
      ? `double-modifier:${preferences.capture.modifier}`
      : `accelerator:${preferences.capture.accelerator}`;
  return `${capture}\u0000${preferences.togglePanel}`;
}

export function ShortcutSettings({
  captureUnavailable,
}: {
  captureUnavailable: boolean;
}) {
  const { document } = useKopperDocument();
  const [candidate, setCandidate] = useState<ShortcutPreferences>(() =>
    structuredClone(document.shortcuts),
  );
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const authoritativeShortcutFingerprint = shortcutFingerprint(document.shortcuts);

  useEffect(() => {
    setCandidate(structuredClone(document.shortcuts));
  }, [authoritativeShortcutFingerprint]);

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        setRecording(false);
        setMessage("Shortcut recording cancelled.");
        return;
      }
      const accelerator = acceleratorFromEvent(event);
      if (accelerator === null) return;
      setCandidate((current) => ({
        ...current,
        capture: { kind: "accelerator", accelerator },
      }));
      setRecording(false);
      setMessage(null);
    };
    globalThis.addEventListener("keydown", onKeyDown, true);
    return () => globalThis.removeEventListener("keydown", onKeyDown, true);
  }, [recording]);

  const save = async (preferences: ShortcutPreferences, reset = false) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const valid = await window.kopper.validateShortcuts(preferences);
      if (!valid.ok) {
        setMessage(valid.error.message);
        return;
      }
      const saved = await window.kopper.saveShortcuts(preferences);
      if (!saved.ok) {
        setMessage(saved.error.message);
        return;
      }
      setCandidate(structuredClone(saved.value.shortcuts));
      setMessage(reset ? "Shortcuts reset to defaults." : "Shortcuts saved.");
    } catch {
      setMessage("Shortcuts could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const changeToggle = (togglePanel: string) => {
    setCandidate((current) => ({ ...current, togglePanel }));
    setMessage(null);
  };

  const pin = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await window.kopper.setPinned(!document.window.pinned);
      setMessage(
        result.ok
          ? result.value.window.pinned
            ? "Panel pinned."
            : "Panel unpinned."
          : result.error.message,
      );
    } catch {
      setMessage("The panel pin could not be changed.");
    } finally {
      setBusy(false);
    }
  };

  const testCapture = async () => {
    if (captureUnavailable || busy || testing) return;
    setTesting(true);
    setMessage("Testing capture…");
    try {
      const result = await window.kopper.requestCapture();
      setMessage(
        result.status === "captured"
          ? "Test capture saved."
          : result.status === "empty"
            ? "No selected text was found."
            : result.error.message,
      );
    } catch {
      setMessage("Test capture could not run.");
    } finally {
      setTesting(false);
    }
  };

  const captureLabel =
    candidate.capture.kind === "double-modifier"
      ? "Double Shift"
      : candidate.capture.accelerator;

  return (
    <section
      className="grid min-w-0 gap-5"
      aria-labelledby="shortcut-settings-title"
    >
      <div>
        <h2 id="shortcut-settings-title" className="m-0 text-sm font-semibold">
          Shortcuts & panel
        </h2>
        <p className="m-0 text-xs text-muted-foreground">
          Configure capture without exposing native keyboard access to this page.
        </p>
      </div>

      <Separator />
      <div className="grid min-w-0 gap-2">
        <Label
          id="capture-selection-label"
          className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground"
        >
          Capture selection
        </Label>
        <RadioGroup
          value={recording ? "accelerator" : candidate.capture.kind}
          aria-labelledby="capture-selection-label"
          disabled={busy}
          onValueChange={(value) => {
            if (value === "double-modifier") {
              setRecording(false);
              setCandidate((current) => ({
                ...current,
                capture: { kind: "double-modifier", modifier: "shift" },
              }));
              setMessage(null);
              return;
            }
            if (value === "accelerator") {
              setRecording(true);
              setMessage("Press a shortcut, or Escape to cancel.");
            }
          }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <RadioGroupItem id="capture-double-shift" value="double-modifier" />
            <Label htmlFor="capture-double-shift" className="text-xs">
              Double Shift
            </Label>
          </div>
          <div className="grid min-w-0 gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <RadioGroupItem id="capture-accelerator" value="accelerator" />
              <Label htmlFor="capture-accelerator" className="text-xs">
                Keyboard shortcut
              </Label>
            </div>
            <div className="ml-6 flex min-w-0 flex-wrap items-center gap-2">
              <Button
                type="button"
                size="xs"
                variant={recording ? "secondary" : "outline"}
                aria-pressed={recording}
                disabled={busy}
                onClick={() => {
                  setRecording(true);
                  setMessage("Press a shortcut, or Escape to cancel.");
                }}
              >
                {recording ? "Recording…" : "Record shortcut"}
              </Button>
              <span
                className="min-w-0 break-all font-mono text-[11px]"
                aria-label="Capture shortcut candidate"
              >
                {captureLabel}
              </span>
            </div>
          </div>
        </RadioGroup>
      </div>

      <Separator />
      <div className="grid min-w-0 gap-1">
        <Label htmlFor="toggle-panel-shortcut" className="text-xs">
          Toggle panel
        </Label>
        <Input
          id="toggle-panel-shortcut"
          value={candidate.togglePanel}
          disabled={busy}
          onChange={(event) => changeToggle(event.currentTarget.value)}
        />
      </div>

      <Separator />
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-xs font-medium">Keep panel on top</p>
          <p className="m-0 break-words text-[11px] text-muted-foreground">
            Applied only after native and local persistence both succeed.
          </p>
        </div>
        <Button
          type="button"
          size="xs"
          variant={document.window.pinned ? "secondary" : "outline"}
          aria-pressed={document.window.pinned}
          disabled={busy}
          onClick={() => void pin()}
        >
          {document.window.pinned ? "Pinned" : "Pin panel"}
        </Button>
      </div>

      {captureUnavailable && (
        <p role="status" className="m-0 text-xs text-muted-foreground">
          Capture is unavailable until Accessibility access is granted.
        </p>
      )}
      {message !== null && (
        <p role="status" aria-live="polite" className="m-0 text-xs text-muted-foreground">
          {message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="xs" disabled={busy} onClick={() => void save(candidate)}>
          Save shortcuts
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={busy}
          onClick={() => {
            const defaults = structuredClone(DEFAULT_SHORTCUT_PREFERENCES);
            setCandidate(defaults);
            setRecording(false);
            void save(defaults, true);
          }}
        >
          Reset
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={busy || testing || captureUnavailable}
          aria-busy={testing}
          onClick={() => void testCapture()}
        >
          Test capture
        </Button>
      </div>
    </section>
  );
}

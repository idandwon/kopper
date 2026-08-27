import { useEffect, useLayoutEffect, useState } from "react";

import {
  DEFAULT_SHORTCUT_PREFERENCES,
  type ShortcutPreferences,
} from "../../../../shared/domain/document";
import { useKopperDocument } from "../../app/DocumentProvider";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "../../components/ui/radio-group";
import { Separator } from "../../components/ui/separator";
import { Switch } from "../../components/ui/switch";
import {
  SettingsFeedback,
  type SettingsFeedbackValue,
} from "./SettingsFeedback";
import { SettingsSection } from "./SettingsSection";

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

function formatShortcut(accelerator: string): string {
  const keys: Record<string, string> = {
    Command: "⌘",
    CommandOrControl: "⌘/Ctrl",
    Control: "⌃",
    Alt: "⌥",
    Shift: "⇧",
  };
  return accelerator
    .split("+")
    .map((part) => keys[part] ?? part)
    .join(" ");
}

type RecordingTarget = "capture" | "panel";

export function ShortcutSettings({
  active,
  captureUnavailable,
}: {
  active: boolean;
  captureUnavailable: boolean;
}) {
  const { document } = useKopperDocument();
  const [candidate, setCandidate] = useState<ShortcutPreferences>(() =>
    structuredClone(document.shortcuts),
  );
  const [recordingTarget, setRecordingTarget] =
    useState<RecordingTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<SettingsFeedbackValue | null>(null);
  const authoritativeShortcutFingerprint = shortcutFingerprint(document.shortcuts);

  useEffect(() => {
    setCandidate(structuredClone(document.shortcuts));
  }, [authoritativeShortcutFingerprint]);

  useLayoutEffect(() => {
    if (!active && recordingTarget !== null) {
      setRecordingTarget(null);
      setFeedback(null);
    }
  }, [active, recordingTarget]);

  useLayoutEffect(() => {
    if (!active || recordingTarget === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        setRecordingTarget(null);
        setFeedback({
          text: "Shortcut recording cancelled.",
          tone: "status",
        });
        return;
      }
      const accelerator = acceleratorFromEvent(event);
      if (accelerator === null) return;
      setCandidate((current) =>
        recordingTarget === "capture"
          ? {
              ...current,
              capture: { kind: "accelerator", accelerator },
            }
          : { ...current, togglePanel: accelerator },
      );
      setRecordingTarget(null);
      setFeedback(null);
    };
    globalThis.addEventListener("keydown", onKeyDown, true);
    return () => globalThis.removeEventListener("keydown", onKeyDown, true);
  }, [active, recordingTarget]);

  const save = async (preferences: ShortcutPreferences, reset = false) => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const valid = await window.kopper.validateShortcuts(preferences);
      if (!valid.ok) {
        setFeedback({ text: valid.error.message, tone: "error" });
        return;
      }
      const saved = await window.kopper.saveShortcuts(preferences);
      if (!saved.ok) {
        setFeedback({ text: saved.error.message, tone: "error" });
        return;
      }
      setCandidate(structuredClone(saved.value.shortcuts));
      setFeedback({
        text: reset ? "Shortcuts reset to defaults." : "Shortcuts saved.",
        tone: "status",
      });
    } catch {
      setFeedback({ text: "Shortcuts could not be saved.", tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const record = (target: RecordingTarget) => {
    setRecordingTarget(target);
    setFeedback({
      text: `Press a ${target === "capture" ? "capture" : "panel"} shortcut, or Escape to cancel.`,
      tone: "status",
    });
  };

  const pin = async () => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await window.kopper.setPinned(!document.window.pinned);
      setFeedback(
        result.ok
          ? {
              text: result.value.window.pinned
                ? "Panel pinned."
                : "Panel unpinned.",
              tone: "status",
            }
          : { text: result.error.message, tone: "error" },
      );
    } catch {
      setFeedback({
        text: "The panel pin could not be changed.",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const testCapture = async () => {
    if (captureUnavailable || busy || testing) return;
    setTesting(true);
    setFeedback({ text: "Testing capture…", tone: "status" });
    try {
      const result = await window.kopper.requestCapture();
      if (result.status === "captured") {
        setFeedback({ text: "Test capture saved.", tone: "status" });
      } else if (result.status === "empty") {
        setFeedback({ text: "No selected text was found.", tone: "status" });
      } else {
        setFeedback({ text: result.error.message, tone: "error" });
      }
    } catch {
      setFeedback({ text: "Test capture could not run.", tone: "error" });
    } finally {
      setTesting(false);
    }
  };

  const recordingCapture = recordingTarget === "capture";
  const recordingPanel = recordingTarget === "panel";

  return (
    <SettingsSection
      title="Keyboard shortcuts"
      description="Choose the keys you use from other apps."
      headingId="shortcut-settings-title"
      separated
      className="min-w-0 gap-4"
    >
      <div
        className="grid min-w-0 gap-3"
      >
        <div className="grid gap-1">
          <h3 id="capture-selection-label" className="m-0 text-sm font-medium">
            Capture selected text
          </h3>
          <p className="m-0 text-xs text-muted-foreground">
            Choose Double Shift or record your own shortcut.
          </p>
        </div>
        <RadioGroup
          value={recordingCapture ? "accelerator" : candidate.capture.kind}
          aria-labelledby="capture-selection-label"
          disabled={busy}
          className="grid gap-2"
          onValueChange={(value) => {
            if (value === "double-modifier") {
              setRecordingTarget(null);
              setCandidate((current) => ({
                ...current,
                capture: { kind: "double-modifier", modifier: "shift" },
              }));
              setFeedback(null);
              return;
            }
            if (value === "accelerator") {
              record("capture");
            }
          }}
        >
          <div className="flex min-h-9 min-w-0 items-center gap-3 rounded-md border border-border bg-background px-3 py-2">
            <RadioGroupItem id="capture-double-shift" value="double-modifier" />
            <Label
              htmlFor="capture-double-shift"
              className="min-w-0 flex-1 text-sm"
            >
              Double Shift
            </Label>
            <kbd
              aria-label={
                candidate.capture.kind === "double-modifier"
                  ? "Capture shortcut candidate"
                  : undefined
              }
              className="shrink-0 rounded-sm border border-border bg-muted px-2 py-1 font-mono text-xs text-muted-foreground"
            >
              ⇧ ⇧
            </kbd>
          </div>
          <div className="flex min-h-9 min-w-0 flex-wrap items-center gap-3 rounded-md border border-border bg-background px-3 py-2">
            <RadioGroupItem id="capture-accelerator" value="accelerator" />
            <Label
              htmlFor="capture-accelerator"
              className="min-w-0 flex-1 text-sm"
            >
              Custom shortcut
            </Label>
            {recordingCapture ? (
              <span
                className="text-xs text-muted-foreground"
                aria-live="polite"
              >
                Listening…
              </span>
            ) : candidate.capture.kind === "accelerator" ? (
              <kbd
                aria-label="Capture shortcut candidate"
                className="min-w-0 break-words rounded-sm border border-border bg-muted px-2 py-1 font-mono text-xs text-muted-foreground"
              >
                {formatShortcut(candidate.capture.accelerator)}
              </kbd>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant={recordingCapture ? "secondary" : "outline"}
              aria-label={
                recordingCapture
                  ? "Recording capture shortcut…"
                  : "Change capture shortcut"
              }
              aria-pressed={recordingCapture}
              disabled={busy}
              onClick={() => record("capture")}
            >
              {recordingCapture
                ? "Recording…"
                : candidate.capture.kind === "accelerator"
                  ? "Change"
                  : "Record"}
            </Button>
          </div>
        </RadioGroup>
      </div>

      <Separator />
      <div
        role="group"
        aria-labelledby="panel-shortcut-label"
        className="grid min-w-0 gap-3"
      >
        <div className="grid gap-1">
          <h3 id="panel-shortcut-label" className="m-0 text-sm font-medium">
            Show or hide Kopper
          </h3>
          <p className="m-0 text-xs text-muted-foreground">
            Use this shortcut from any app.
          </p>
        </div>
        <div className="flex min-h-9 min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2">
          {recordingPanel ? (
            <span className="text-xs text-muted-foreground" aria-live="polite">
              Listening…
            </span>
          ) : (
            <kbd
              aria-label={`Panel shortcut: ${candidate.togglePanel}`}
              className="min-w-0 break-words rounded-sm border border-border bg-muted px-2 py-1 font-mono text-xs text-muted-foreground"
            >
              {formatShortcut(candidate.togglePanel)}
            </kbd>
          )}
          <Button
            type="button"
            size="sm"
            variant={recordingPanel ? "secondary" : "outline"}
            aria-label={
              recordingPanel
                ? "Recording panel shortcut…"
                : "Change panel shortcut"
            }
            aria-pressed={recordingPanel}
            disabled={busy}
            onClick={() => record("panel")}
          >
            {recordingPanel ? "Recording…" : "Change"}
          </Button>
        </div>
      </div>

      <Separator />
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Label htmlFor="keep-panel-on-top" className="text-sm font-medium">
            Keep panel on top
          </Label>
          <p className="m-0 text-xs text-muted-foreground">
            Keep Kopper above other windows.
          </p>
        </div>
        <Switch
          id="keep-panel-on-top"
          aria-label="Keep panel on top"
          checked={document.window.pinned}
          disabled={busy}
          onCheckedChange={() => void pin()}
        />
      </div>

      {captureUnavailable && (
        <p role="status" className="m-0 text-xs text-muted-foreground">
          Capture is unavailable until Accessibility access is granted.
        </p>
      )}
      <SettingsFeedback
        value={feedback}
        className="text-muted-foreground"
        persistent={recordingTarget !== null || testing}
        onDismiss={() => setFeedback(null)}
      />

      <div className="flex min-w-0 items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            const defaults = structuredClone(DEFAULT_SHORTCUT_PREFERENCES);
            setCandidate(defaults);
            setRecordingTarget(null);
            void save(defaults, true);
          }}
        >
          Reset
        </Button>
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={
              busy || testing || captureUnavailable || recordingTarget !== null
            }
            aria-busy={testing}
            onClick={() => void testCapture()}
          >
            Test capture
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || recordingTarget !== null}
            onClick={() => void save(candidate)}
          >
            Save shortcuts
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}

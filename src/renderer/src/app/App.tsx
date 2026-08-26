import { DocumentPanel } from "./DocumentPanel";
import { useKopperDocument } from "./DocumentProvider";
import {
  ExpandedEditorWindow,
  expandedEditorNoteId,
} from "../features/editor/ExpandedEditorWindow";
import { AccessibilityPermissionGate } from "../features/onboarding/AccessibilityPermissionGate";
import { LoadingPanel } from "../features/panel/PanelShell";
import { RecoveryScreen } from "../features/recovery/RecoveryScreen";

export function App() {
  const { document, ready, error, pendingAction } = useKopperDocument();
  const editorNoteId = expandedEditorNoteId(globalThis.location.hash);

  if (editorNoteId !== null) {
    return <ExpandedEditorWindow noteId={editorNoteId} />;
  }
  if (pendingAction === "load") return <LoadingPanel />;
  if (!ready && error !== null) return <RecoveryScreen error={error} />;

  return (
    <AccessibilityPermissionGate
      renderPanel={(captureUnavailable, permissionControls) => (
        <DocumentPanel
          document={document}
          captureUnavailable={captureUnavailable}
          permissionControls={permissionControls}
        />
      )}
    />
  );
}

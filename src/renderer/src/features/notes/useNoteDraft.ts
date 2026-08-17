import { useEffect, useRef, useState } from "react";

import { useKopperDocument } from "../../app/DocumentProvider";
import {
  useDraftPersistence,
  type DraftSnapshot,
} from "./draft/useDraftPersistence";

export function useNoteDraft() {
  const { document, execute, pendingAction } = useKopperDocument();
  const initialDraft =
    document.draft !== null &&
    document.sections.some(({ id }) => id === document.draft?.sectionId)
      ? document.draft
      : null;
  const initialSnapshot: DraftSnapshot = {
    body: initialDraft?.body ?? "",
    sectionId: initialDraft?.sectionId ?? document.activeSectionId,
  };
  const [body, setBody] = useState(initialSnapshot.body);
  const [sectionId, setSectionId] = useState(initialSnapshot.sectionId);
  const [awaitingDraftClear, setAwaitingDraftClear] =
    useState<DraftSnapshot | null>(null);
  const submittingRef = useRef(false);
  const persistence = useDraftPersistence({
    body,
    initialDraft: initialSnapshot,
    sectionId,
    execute,
    submittingRef,
  });

  useEffect(() => {
    const sectionExists = document.sections.some(
      (section) => section.id === sectionId,
    );
    const persistedDraftSectionExists =
      document.draft !== null &&
      document.sections.some(
        (section) => section.id === document.draft?.sectionId,
      );
    const draftKeepsSection = persistedDraftSectionExists || body.length > 0;
    if (sectionExists && draftKeepsSection) return;
    if (sectionId === document.activeSectionId) return;
    setSectionId(document.activeSectionId);
  }, [
    body,
    document.activeSectionId,
    document.draft,
    document.sections,
    sectionId,
  ]);

  useEffect(() => {
    const draftClearAcknowledged =
      awaitingDraftClear !== null &&
      document.draft === null &&
      pendingAction === null;
    if (!draftClearAcknowledged) return;

    persistence.acknowledge({
      sectionId: awaitingDraftClear.sectionId,
      body: "",
    });
    if (persistence.getLatest().body === awaitingDraftClear.body) {
      setBody("");
    }
    submittingRef.current = false;
    setAwaitingDraftClear(null);
  }, [awaitingDraftClear, document.draft, pendingAction, persistence]);

  const submit = async () => {
    const latest = persistence.getLatest();
    if (latest.body.trim().length === 0 || submittingRef.current) return;

    submittingRef.current = true;
    persistence.cancelScheduledSave();
    const pendingSave = persistence.getPendingSave();
    if (pendingSave !== null) await pendingSave;
    if (!persistence.isMounted()) return;

    const added = await execute({
      type: "note.add",
      sectionId: latest.sectionId,
      body: latest.body,
    });
    if (!persistence.isMounted()) return;
    if (!added) {
      submittingRef.current = false;
      return;
    }

    setAwaitingDraftClear(latest);
    await execute({ type: "draft.clear" });
  };

  const sectionTitle =
    document.sections.find((section) => section.id === sectionId)?.title ??
    "Active section";
  const submissionBlocked =
    body.trim().length === 0 ||
    pendingAction !== null ||
    awaitingDraftClear !== null;

  return {
    body,
    changeBody: setBody,
    sectionTitle,
    submissionBlocked,
    submit,
  };
}

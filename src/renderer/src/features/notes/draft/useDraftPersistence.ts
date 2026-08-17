import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";

import type { DocumentCommand } from "../../../../../shared/domain/commands";

const DRAFT_DEBOUNCE_MS = 250;

export interface DraftSnapshot {
  body: string;
  sectionId: string;
}

type ExecuteDocumentCommand = (command: DocumentCommand) => Promise<boolean>;

function draftKey({ body, sectionId }: DraftSnapshot): string {
  return body.length === 0 ? "cleared" : JSON.stringify([sectionId, body]);
}

function requestDraftWrite(
  execute: ExecuteDocumentCommand,
  draft: DraftSnapshot,
): Promise<boolean> {
  try {
    return draft.body.length === 0
      ? execute({ type: "draft.clear" })
      : execute({
          type: "draft.set",
          sectionId: draft.sectionId,
          body: draft.body,
        });
  } catch {
    return Promise.resolve(false);
  }
}

interface DraftPersistenceOptions {
  body: string;
  initialDraft: DraftSnapshot;
  sectionId: string;
  execute: ExecuteDocumentCommand;
  submittingRef: RefObject<boolean>;
}

export function useDraftPersistence({
  body,
  initialDraft,
  sectionId,
  execute,
  submittingRef,
}: DraftPersistenceOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const latestRef = useRef<DraftSnapshot>({ body, sectionId });
  const acknowledgedRef = useRef(draftKey(initialDraft));
  const savePromiseRef = useRef<Promise<boolean> | null>(null);

  latestRef.current = { body, sectionId };

  const saveDraft = useCallback(
    (draft: DraftSnapshot): Promise<boolean> => {
      const key = draftKey(draft);
      const request = requestDraftWrite(execute, draft);
      const persistence = request.then(
        (acknowledged) => {
          if (acknowledged) acknowledgedRef.current = key;
          return acknowledged;
        },
        () => false,
      );
      savePromiseRef.current = persistence;
      void persistence.then(() => {
        if (savePromiseRef.current === persistence) {
          savePromiseRef.current = null;
        }
      });
      return persistence;
    },
    [execute],
  );

  useEffect(() => {
    const currentKey = draftKey({ body, sectionId });
    if (currentKey === acknowledgedRef.current || submittingRef.current) return;

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const saveLatestIfNeeded = () => {
        if (!mountedRef.current || submittingRef.current) return;
        const latest = latestRef.current;
        if (draftKey(latest) !== acknowledgedRef.current) {
          void saveDraft(latest);
        }
      };
      const pendingSave = savePromiseRef.current;
      if (pendingSave === null) {
        saveLatestIfNeeded();
        return;
      }

      void pendingSave.then(() => {
        if (savePromiseRef.current !== null) return;
        saveLatestIfNeeded();
      });
    }, DRAFT_DEBOUNCE_MS);

    return () => {
      if (timerRef.current === null) return;
      clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [body, saveDraft, sectionId, submittingRef]);

  useEffect(
    () => () => {
      mountedRef.current = false;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      if (submittingRef.current) return;

      const flushLatest = async () => {
        const pendingSave = savePromiseRef.current;
        if (pendingSave !== null) await pendingSave;

        const latest = latestRef.current;
        if (draftKey(latest) !== acknowledgedRef.current) {
          await saveDraft(latest);
        }
      };
      void flushLatest();
    },
    [saveDraft, submittingRef],
  );

  const acknowledge = useCallback((draft: DraftSnapshot) => {
    acknowledgedRef.current = draftKey(draft);
  }, []);

  const cancelScheduledSave = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const getLatest = useCallback(() => latestRef.current, []);
  const getPendingSave = useCallback(() => savePromiseRef.current, []);
  const isMounted = useCallback(() => mountedRef.current, []);

  return useMemo(
    () => ({
      acknowledge,
      cancelScheduledSave,
      getLatest,
      getPendingSave,
      isMounted,
    }),
    [acknowledge, cancelScheduledSave, getLatest, getPendingSave, isMounted],
  );
}

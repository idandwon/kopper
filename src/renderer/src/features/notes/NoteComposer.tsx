import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "../../components/ui/button";
import { useKopperDocument } from "../../app/DocumentProvider";

const DRAFT_DEBOUNCE_MS = 250;

function draftKey(sectionId: string, body: string): string {
  return JSON.stringify([sectionId, body]);
}

export function NoteComposer() {
  const { document, execute, pendingAction } = useKopperDocument();
  const initialDraft =
    document.draft !== null &&
    document.sections.some(({ id }) => id === document.draft?.sectionId)
      ? document.draft
      : null;
  const [body, setBody] = useState(initialDraft?.body ?? "");
  const [sectionId, setSectionId] = useState(
    initialDraft?.sectionId ?? document.activeSectionId,
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const submittingRef = useRef(false);
  const latestRef = useRef({ body, sectionId });
  const acknowledgedRef = useRef(draftKey(sectionId, initialDraft?.body ?? ""));
  const savePromiseRef = useRef<Promise<boolean> | null>(null);

  latestRef.current = { body, sectionId };

  useEffect(() => {
    if (document.sections.some((section) => section.id === sectionId)) return;
    setSectionId(document.activeSectionId);
  }, [document.activeSectionId, document.sections, sectionId]);

  useEffect(() => {
    const currentKey = draftKey(sectionId, body);
    if (currentKey === acknowledgedRef.current || submittingRef.current) return;

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const promise = execute({ type: "draft.set", sectionId, body });
      savePromiseRef.current = promise;
      void promise.then((acknowledged) => {
        if (savePromiseRef.current === promise) savePromiseRef.current = null;
        if (acknowledged && mountedRef.current) {
          acknowledgedRef.current = currentKey;
        }
      });
    }, DRAFT_DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [body, execute, sectionId]);

  useEffect(
    () => () => {
      mountedRef.current = false;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      const latest = latestRef.current;
      const currentKey = draftKey(latest.sectionId, latest.body);
      if (
        !submittingRef.current &&
        latest.body.trim().length > 0 &&
        currentKey !== acknowledgedRef.current
      ) {
        void execute({
          type: "draft.set",
          sectionId: latest.sectionId,
          body: latest.body,
        });
      }
    },
    [execute],
  );

  const submit = async () => {
    const latest = latestRef.current;
    if (latest.body.trim().length === 0 || submittingRef.current) return;

    submittingRef.current = true;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const pendingSave = savePromiseRef.current;
    if (pendingSave !== null) await pendingSave;
    if (!mountedRef.current) return;

    const added = await execute({
      type: "note.add",
      sectionId: latest.sectionId,
      body: latest.body,
    });
    if (!mountedRef.current) return;
    if (!added) {
      submittingRef.current = false;
      return;
    }

    const cleared = await execute({ type: "draft.clear" });
    if (!mountedRef.current) return;
    submittingRef.current = false;
    if (cleared) {
      const emptyKey = draftKey(latest.sectionId, "");
      acknowledgedRef.current = emptyKey;
      latestRef.current = { body: "", sectionId: latest.sectionId };
      setBody("");
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  };

  const sectionTitle =
    document.sections.find((section) => section.id === sectionId)?.title ??
    "Active section";

  return (
    <div className="absolute right-4 bottom-4 left-5 rounded-xl border border-border bg-card p-2 shadow-sm">
      <label htmlFor="note-composer" className="sr-only">
        Add a note or prompt
      </label>
      <textarea
        id="note-composer"
        value={body}
        onChange={(event) => setBody(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add a note or prompt"
        rows={2}
        className="max-h-36 min-h-12 w-full resize-none rounded-lg border-0 bg-card px-3 py-2 text-sm text-card-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      <div className="flex items-center justify-between gap-2 px-2 pb-1">
        <span className="truncate font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          {sectionTitle}
        </span>
        <Button
          type="button"
          size="xs"
          onClick={() => void submit()}
          disabled={body.trim().length === 0 || pendingAction !== null}
          aria-label="Add note"
        >
          Add <kbd className="font-mono text-[10px]">⌘↵</kbd>
        </Button>
      </div>
    </div>
  );
}

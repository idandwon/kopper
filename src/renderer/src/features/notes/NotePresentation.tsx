import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";

import type { Note } from "../../../../shared/domain/document";
import {
  initialNotePresentationState,
  notePresentationReducer,
  type LifecyclePresentationKind,
  type NotePresentationEntry,
} from "./notePresentationReducer";

const NOTE_EXIT_DURATION_MS = 220;

interface NotePresentationValue {
  entries: readonly NotePresentationEntry[];
  beginLifecycle(kind: LifecyclePresentationKind, notes: Note[]): void;
  finishLifecycle(noteIds: string[], acknowledged: boolean): void;
}

const NotePresentationContext = createContext<NotePresentationValue | null>(
  null,
);

export function useNotePresentation(): NotePresentationValue {
  const presentation = useContext(NotePresentationContext);
  if (presentation === null) {
    throw new Error("Note presentation requires NotePresentationProvider.");
  }
  return presentation;
}

export function NotePresentationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    notePresentationReducer,
    initialNotePresentationState,
  );
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const beginLifecycle = useCallback(
    (kind: LifecyclePresentationKind, notes: Note[]) => {
      dispatch({
        type: "lifecycle.begin",
        kind,
        notes: structuredClone(notes),
      });
    },
    [],
  );

  const finishLifecycle = useCallback(
    (noteIds: string[], acknowledged: boolean) => {
      if (!acknowledged) {
        dispatch({ type: "lifecycle.fail", noteIds });
        return;
      }

      dispatch({ type: "lifecycle.acknowledge", noteIds });
      const reducedMotion =
        globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
        false;
      const exitDuration = reducedMotion ? 0 : NOTE_EXIT_DURATION_MS;
      for (const noteId of noteIds) {
        const existingTimer = timersRef.current.get(noteId);
        if (existingTimer !== undefined) clearTimeout(existingTimer);
        const timer = setTimeout(() => {
          timersRef.current.delete(noteId);
          dispatch({ type: "lifecycle.finish", noteIds: [noteId] });
        }, exitDuration);
        timersRef.current.set(noteId, timer);
      }
    },
    [],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      entries: state.entries,
      beginLifecycle,
      finishLifecycle,
    }),
    [beginLifecycle, finishLifecycle, state.entries],
  );

  return (
    <NotePresentationContext value={value}>
      {children}
    </NotePresentationContext>
  );
}

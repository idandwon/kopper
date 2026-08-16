import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { DocumentCommand } from "../../../shared/domain/commands";
import {
  createEmptyDocument,
  type KopperDocument,
} from "../../../shared/domain/document";
import type { KopperError } from "../../../shared/domain/errors";

export interface KopperDocumentContextValue {
  document: KopperDocument;
  pendingAction: string | null;
  error: KopperError | null;
  execute(command: DocumentCommand): Promise<boolean>;
  undo(): Promise<boolean>;
  retryLastAction(): Promise<boolean>;
  clearError(): void;
}

const KopperDocumentContext = createContext<
  KopperDocumentContextValue | undefined
>(undefined);

const readFailure = (): KopperError => ({
  code: "read_failed",
  message: "The Kopper document could not be read.",
  retryable: true,
  recoveryAction: "retry",
});

const commandFailure = (): KopperError => ({
  code: "write_failed",
  message: "The Kopper document command could not be completed.",
  retryable: true,
  recoveryAction: "retry",
});

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [document, setDocument] = useState<KopperDocument>(() =>
    createEmptyDocument(new Date(0)),
  );
  const [pendingAction, setPendingAction] = useState<string | null>("load");
  const [error, setError] = useState<KopperError | null>(null);
  const mountedRef = useRef(true);
  const readyRef = useRef(false);
  const mutationPendingRef = useRef(false);
  const retryCommandRef = useRef<DocumentCommand | undefined>(undefined);

  useEffect(() => {
    mountedRef.current = true;
    let receivedSubscribedSnapshot = false;

    const unsubscribe = window.kopper.subscribeDocument((snapshot) => {
      if (!mountedRef.current) return;

      receivedSubscribedSnapshot = true;
      readyRef.current = true;
      setDocument(snapshot);
      if (!mutationPendingRef.current) setPendingAction(null);
      setError(null);
    });

    void window.kopper.getDocument().then(
      (result) => {
        if (!mountedRef.current || receivedSubscribedSnapshot) return;

        if (result.ok) {
          readyRef.current = true;
          setDocument(result.value);
          setError(null);
        } else {
          readyRef.current = false;
          setError(result.error);
        }
        setPendingAction(null);
      },
      () => {
        if (!mountedRef.current || receivedSubscribedSnapshot) return;

        readyRef.current = false;
        setError(readFailure());
        setPendingAction(null);
      },
    );

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, []);

  const runCommand = useCallback(
    async (command: DocumentCommand, retrying: boolean): Promise<boolean> => {
      if (mutationPendingRef.current || !readyRef.current) return false;

      mutationPendingRef.current = true;
      if (!retrying) retryCommandRef.current = undefined;
      if (mountedRef.current) setPendingAction(command.type);

      try {
        let result;
        try {
          result = await window.kopper.execute(command);
        } catch {
          result = { ok: false as const, error: commandFailure() };
        }

        if (!mountedRef.current) return false;
        if (result.ok) {
          setDocument(result.value);
          setError(null);
          retryCommandRef.current = undefined;
          return true;
        }

        setError(result.error);
        retryCommandRef.current = result.error.retryable ? command : undefined;
        return false;
      } finally {
        mutationPendingRef.current = false;
        if (mountedRef.current) setPendingAction(null);
      }
    },
    [],
  );

  const execute = useCallback(
    (command: DocumentCommand) => runCommand(command, false),
    [runCommand],
  );

  const undo = useCallback(async (): Promise<boolean> => {
    if (mutationPendingRef.current || !readyRef.current) return false;

    mutationPendingRef.current = true;
    retryCommandRef.current = undefined;
    if (mountedRef.current) setPendingAction("undo");

    try {
      let result;
      try {
        result = await window.kopper.undo();
      } catch {
        result = { ok: false as const, error: commandFailure() };
      }

      if (!mountedRef.current) return false;
      if (result.ok) {
        setDocument(result.value);
        setError(null);
        return true;
      }

      setError(result.error);
      return false;
    } finally {
      mutationPendingRef.current = false;
      if (mountedRef.current) setPendingAction(null);
    }
  }, []);

  const retryLastAction = useCallback((): Promise<boolean> => {
    const command = retryCommandRef.current;
    return command === undefined
      ? Promise.resolve(false)
      : runCommand(command, true);
  }, [runCommand]);

  const clearError = useCallback(() => {
    if (mountedRef.current) setError(null);
  }, []);

  const value = useMemo<KopperDocumentContextValue>(
    () => ({
      document,
      pendingAction,
      error,
      execute,
      undo,
      retryLastAction,
      clearError,
    }),
    [
      clearError,
      document,
      error,
      execute,
      pendingAction,
      retryLastAction,
      undo,
    ],
  );

  return (
    <KopperDocumentContext.Provider value={value}>
      {children}
    </KopperDocumentContext.Provider>
  );
}

export function useKopperDocument(): KopperDocumentContextValue {
  const context = useContext(KopperDocumentContext);
  if (context === undefined) {
    throw new Error("useKopperDocument must be used within DocumentProvider");
  }
  return context;
}

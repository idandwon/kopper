import { useEffect, useState } from "react";

import type { KopperDocument } from "../../../shared/domain/document";
import type { KopperError } from "../../../shared/domain/errors";

export type DocumentState =
  | { status: "loading" }
  | { status: "ready"; document: KopperDocument }
  | { status: "error"; error: KopperError };

export function useDocument(): DocumentState {
  const [state, setState] = useState<DocumentState>({ status: "loading" });

  useEffect(() => {
    let mounted = true;
    let receivedSubscribedSnapshot = false;

    const unsubscribe = window.kopper.subscribeDocument((document) => {
      if (!mounted) return;

      receivedSubscribedSnapshot = true;
      setState({ status: "ready", document });
    });

    void window.kopper.getDocument().then(
      (result) => {
        if (!mounted || receivedSubscribedSnapshot) return;

        setState(
          result.ok
            ? { status: "ready", document: result.value }
            : { status: "error", error: result.error },
        );
      },
      () => {
        if (!mounted || receivedSubscribedSnapshot) return;

        setState({
          status: "error",
          error: {
            code: "read_failed",
            message: "The Kopper document could not be read.",
            retryable: true,
            recoveryAction: "retry",
          },
        });
      },
    );

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return state;
}

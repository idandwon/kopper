import {
  createContext,
  useContext,
  useLayoutEffect,
  type ReactNode,
} from "react";

const NotesSurfaceVisibilityContext = createContext(true);

export function NotesSurfaceVisibilityProvider({
  visible,
  children,
}: {
  visible: boolean;
  children: ReactNode;
}) {
  return (
    <NotesSurfaceVisibilityContext.Provider value={visible}>
      {children}
    </NotesSurfaceVisibilityContext.Provider>
  );
}

export function useNotesSurfaceOverlay(
  requestedOpen: boolean,
  onOpenChange: (open: boolean) => void,
) {
  const notesVisible = useContext(NotesSurfaceVisibilityContext);

  useLayoutEffect(() => {
    if (!notesVisible && requestedOpen) onOpenChange(false);
  }, [notesVisible, onOpenChange, requestedOpen]);

  return {
    open: notesVisible && requestedOpen,
    onOpenChange: (open: boolean) => onOpenChange(notesVisible && open),
  };
}

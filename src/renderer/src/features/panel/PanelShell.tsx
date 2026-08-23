import type { ReactNode } from "react";

export function PanelShell({ children }: { children: ReactNode }) {
  return (
    <main
      data-panel-shell="true"
      className="kopper-panel-shell relative mx-auto flex h-dvh min-h-0 min-w-0 w-full max-w-[380px] flex-col overflow-hidden border border-border text-foreground"
    >
      <div
        data-panel-drag-region="true"
        aria-hidden="true"
        className="kopper-panel-drag-region"
      />
      {children}
    </main>
  );
}

export function LoadingPanel() {
  return (
    <PanelShell>
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden p-6">
        <div
          role="progressbar"
          aria-label="Loading notes"
          aria-valuetext="Loading notes"
          className="h-1 w-24 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full w-1/2 rounded-full bg-primary motion-safe:animate-pulse" />
        </div>
      </div>
    </PanelShell>
  );
}

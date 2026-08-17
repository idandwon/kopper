import type { ReactNode } from "react";

function LifecycleRail() {
  return (
    <div
      className="absolute inset-y-0 left-0 w-1 bg-[linear-gradient(to_bottom,var(--capture),var(--completed))]"
      aria-hidden="true"
    />
  );
}

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
      <LifecycleRail />
      <span className="sr-only">Lifecycle: captured to completed</span>
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

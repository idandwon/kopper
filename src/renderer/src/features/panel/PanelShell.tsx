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
    <main className="relative mx-auto flex h-dvh w-full max-w-[380px] flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-background text-foreground">
      <LifecycleRail />
      <span className="sr-only">Lifecycle: captured to completed</span>
      {children}
    </main>
  );
}

export function LoadingPanel() {
  return (
    <PanelShell>
      <div className="flex flex-1 items-center justify-center p-6">
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

import type { ReactNode } from "react";

import { Button } from "../../components/ui/button";
import { Progress } from "../../components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { CloseIcon } from "./PanelIcons";

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
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-4 right-4 z-40"
              aria-label="Hide Kopper"
              onClick={() => void window.kopper.hidePanel()}
            >
              <CloseIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Hide Kopper</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {children}
    </main>
  );
}

export function LoadingPanel({ label = "Loading notes" }: { label?: string }) {
  return (
    <PanelShell>
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden p-6">
        <Progress
          aria-label={label}
          aria-valuetext={label}
          className="w-24 motion-safe:animate-pulse"
          value={50}
        />
      </div>
    </PanelShell>
  );
}

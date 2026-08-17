import type * as React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";

import { cn } from "../../lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

function TooltipContent({
  className,
  sideOffset = 4,
  collisionPadding = 16,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "z-50 max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-md bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };

import type * as React from "react";
import { Select as SelectPrimitive } from "radix-ui";

import { cn } from "../../lib/utils";

const Select = SelectPrimitive.Root;
const SelectValue = SelectPrimitive.Value;

function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger className={cn("flex h-8 min-w-40 items-center justify-between gap-2 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50", className)} {...props}>
      {children}<SelectPrimitive.Icon aria-hidden="true">⌄</SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({ className, children, position = "popper", collisionPadding = 16, ...props }: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content position={position} collisionPadding={collisionPadding} className={cn("z-[70] max-h-[calc(100dvh-2rem)] w-[var(--radix-select-trigger-width)] min-w-0 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md", className)} {...props}>
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item className={cn("relative flex cursor-default select-none items-center rounded-sm py-1.5 pr-7 pl-2 text-xs outline-none focus:bg-accent focus:text-accent-foreground", className)} {...props}>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2" aria-hidden="true">✓</SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };

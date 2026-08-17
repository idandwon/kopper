import type * as React from "react";
import { ContextMenu as ContextMenuPrimitive } from "radix-ui";

import { cn } from "../../lib/utils";

const ContextMenu = ContextMenuPrimitive.Root;
const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
const ContextMenuPortal = ContextMenuPrimitive.Portal;
const ContextMenuSub = ContextMenuPrimitive.Sub;

function ContextMenuContent({
  className,
  collisionPadding = 16,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPortal>
      <ContextMenuPrimitive.Content
        collisionPadding={collisionPadding}
        className={cn(
          "z-50 max-h-[calc(100dvh-2rem)] w-44 min-w-0 max-w-[min(calc(100vw-2rem),var(--radix-context-menu-content-available-width))] overflow-y-auto overflow-x-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95",
          className,
        )}
        {...props}
      />
    </ContextMenuPortal>
  );
}

function ContextMenuSubContent({
  className,
  collisionPadding = 16,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  return (
    <ContextMenuPortal>
      <ContextMenuPrimitive.SubContent
        collisionPadding={collisionPadding}
        className={cn(
          "z-50 max-h-[calc(100dvh-2rem)] w-36 min-w-0 max-w-[min(calc(100vw-2rem),var(--radix-context-menu-content-available-width))] overflow-y-auto overflow-x-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none motion-safe:animate-in motion-safe:fade-in-0",
          className,
        )}
        {...props}
      />
    </ContextMenuPortal>
  );
}

function ContextMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item>) {
  return (
    <ContextMenuPrimitive.Item
      className={cn(
        "relative flex cursor-default items-center gap-3 rounded-md px-2 py-1.5 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function ContextMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "ml-auto font-mono text-[10px] tracking-wide text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function ContextMenuSubTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger>) {
  return (
    <ContextMenuPrimitive.SubTrigger
      className={cn(
        "relative flex cursor-default select-none items-center rounded-md px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent",
        className,
      )}
      {...props}
    >
      {children}
      <span aria-hidden="true" className="ml-auto pl-3 text-muted-foreground">
        ›
      </span>
    </ContextMenuPrimitive.SubTrigger>
  );
}

function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

export {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
};

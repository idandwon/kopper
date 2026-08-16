import type * as React from "react";
import { Dialog as SheetPrimitive } from "radix-ui";

import { cn } from "../../lib/utils";

const Sheet = SheetPrimitive.Root;
const SheetClose = SheetPrimitive.Close;
const SheetPortal = SheetPrimitive.Portal;

function SheetContent({ className, children, ...props }: React.ComponentProps<typeof SheetPrimitive.Content>) {
  return (
    <SheetPortal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/30" />
      <SheetPrimitive.Content className={cn("fixed inset-y-0 right-0 z-50 flex w-[min(92vw,370px)] flex-col border-l border-border bg-background text-foreground shadow-lg outline-none motion-safe:animate-in motion-safe:slide-in-from-right", className)} {...props}>
        {children}
        <SheetPrimitive.Close className="absolute top-3 right-3 rounded-sm px-2 py-1 text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50">
          <span aria-hidden="true">×</span><span className="sr-only">Close settings</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("border-b border-border px-4 py-3 pr-12", className)} {...props} />;
}
function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className={cn("text-sm font-semibold", className)} {...props} />;
}
function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description className={cn("text-xs text-muted-foreground", className)} {...props} />;
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle };

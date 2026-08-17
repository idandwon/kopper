import type * as React from "react";
import { Toast as ToastPrimitive } from "radix-ui";

import { cn } from "../../lib/utils";

const ToastProvider = ToastPrimitive.Provider;

function Toast({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Root>) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      className={cn(
        "pointer-events-auto relative grid max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] gap-1 overflow-hidden rounded-lg border border-border bg-popover p-4 pr-8 text-popover-foreground shadow-lg outline-none data-[state=open]:motion-safe:animate-in data-[state=closed]:motion-safe:animate-out data-[state=closed]:motion-safe:fade-out-80 data-[state=open]:motion-safe:slide-in-from-top-full",
        className,
      )}
      {...props}
    />
  );
}

function ToastTitle({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Title>) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn("text-sm font-semibold", className)}
      {...props}
    />
  );
}

function ToastDescription({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Description>) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function ToastViewport({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        "fixed top-4 right-4 z-[100] flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] flex-col gap-2 overflow-y-auto outline-none sm:max-w-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Toast, ToastDescription, ToastProvider, ToastTitle, ToastViewport };

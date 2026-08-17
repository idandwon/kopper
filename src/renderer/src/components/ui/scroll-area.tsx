import * as React from "react"
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui"

import { cn } from "../../lib/utils"

function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) {
  const contentChildren: React.ReactNode[] = []
  const explicitScrollBars: React.ReactNode[] = []
  let hasExplicitVerticalScrollBar = false

  React.Children.forEach(children, (child) => {
    if (
      React.isValidElement<React.ComponentProps<typeof ScrollBar>>(child) &&
      child.type === ScrollBar
    ) {
      explicitScrollBars.push(child)
      if (child.props.orientation !== "horizontal") {
        hasExplicitVerticalScrollBar = true
      }
    } else {
      contentChildren.push(child)
    }
  })

  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="size-full rounded-[inherit] transition-[color,box-shadow] outline-none motion-reduce:transition-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1"
      >
        {contentChildren}
      </ScrollAreaPrimitive.Viewport>
      {!hasExplicitVerticalScrollBar && <ScrollBar />}
      {explicitScrollBars}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none motion-reduce:transition-none",
        orientation === "vertical" &&
          "h-full w-2.5 border-l border-l-border/0",
        orientation === "horizontal" &&
          "h-2.5 flex-col border-t border-t-border/0",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
}

export { ScrollArea, ScrollBar }

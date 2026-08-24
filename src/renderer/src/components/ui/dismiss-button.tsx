import type * as React from "react";

import { cn } from "../../lib/utils";
import { Button } from "./button";

export function DismissButton({
  label,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "children" | "size" | "variant"> & {
  label: string;
}) {
  return (
    <Button
      type="button"
      size="icon-xs"
      variant="ghost"
      aria-label={label}
      className={cn("text-muted-foreground", className)}
      {...props}
    >
      <svg aria-hidden="true" viewBox="0 0 16 16">
        <path
          d="m4 4 8 8m0-8-8 8"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.5"
        />
      </svg>
    </Button>
  );
}

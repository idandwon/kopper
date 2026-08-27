import type * as React from "react";

import { Separator } from "../../components/ui/separator";
import { cn } from "../../lib/utils";

export interface SettingsSectionProps extends React.ComponentProps<"section"> {
  title: string;
  description?: string;
  headingId?: string;
  separated?: boolean;
}

export function SettingsSection({
  title,
  description,
  headingId,
  separated = false,
  className,
  children,
  ...props
}: SettingsSectionProps) {
  const id = headingId ?? `settings-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section
      data-slot="settings-section"
      aria-labelledby={id}
      className={cn("grid gap-4", className)}
      {...props}
    >
      <div className="grid gap-1">
        <h2 id={id} className="m-0 text-sm font-semibold">
          {title}
        </h2>
        {description !== undefined && (
          <p className="m-0 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {separated && <Separator />}
      {children}
    </section>
  );
}

import * as React from "react";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";

import { cn } from "../../lib/utils";

const ToggleGroupValueContext = React.createContext<readonly string[]>([]);

function ToggleGroup(
  props: React.ComponentProps<typeof ToggleGroupPrimitive.Root>,
) {
  const [uncontrolledSingleValue, setUncontrolledSingleValue] = React.useState(
    () => (props.type === "single" ? (props.defaultValue ?? "") : ""),
  );
  const [uncontrolledMultipleValue, setUncontrolledMultipleValue] =
    React.useState(() =>
      props.type === "multiple" ? (props.defaultValue ?? []) : [],
    );

  if (props.type === "single") {
    const value = props.value ?? uncontrolledSingleValue;
    const onValueChange = (next: string) => {
      if (props.value === undefined) setUncontrolledSingleValue(next);
      props.onValueChange?.(next);
    };

    return (
      <ToggleGroupValueContext value={[value]}>
        <ToggleGroupPrimitive.Root
          {...props}
          data-slot="toggle-group"
          role={props.role ?? "group"}
          className={cn(
            "inline-flex w-fit items-center rounded-md border border-border bg-background p-0.5",
            props.className,
          )}
          onValueChange={onValueChange}
        />
      </ToggleGroupValueContext>
    );
  }

  const value = props.value ?? uncontrolledMultipleValue;
  const onValueChange = (next: string[]) => {
    if (props.value === undefined) setUncontrolledMultipleValue(next);
    props.onValueChange?.(next);
  };

  return (
    <ToggleGroupValueContext value={value}>
      <ToggleGroupPrimitive.Root
        {...props}
        data-slot="toggle-group"
        role={props.role ?? "group"}
        className={cn(
          "inline-flex w-fit items-center rounded-md border border-border bg-background p-0.5",
          props.className,
        )}
        onValueChange={onValueChange}
      />
    </ToggleGroupValueContext>
  );
}

function ToggleGroupItem({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  const selectedValues = React.useContext(ToggleGroupValueContext);

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      role="button"
      aria-checked={undefined}
      aria-pressed={selectedValues.includes(value)}
      value={value}
      className={cn(
        "inline-flex h-8 min-w-8 items-center justify-center gap-2 rounded-sm px-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };

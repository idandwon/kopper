import type { Ref } from "react";

import { Input } from "../../components/ui/input";
import { SearchIcon } from "./SearchIcon";

export interface SearchFieldProps {
  query: string;
  inputRef?: Ref<HTMLInputElement>;
  onQueryChange(query: string): void;
}

export function SearchField({
  query,
  inputRef,
  onQueryChange,
}: SearchFieldProps) {
  return (
    <div className="relative min-w-0 w-full">
      <SearchIcon
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        ref={inputRef}
        type="search"
        aria-label="Search notes"
        value={query}
        onChange={(event) => onQueryChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          if (query.length > 0) {
            onQueryChange("");
            return;
          }
          event.currentTarget.blur();
        }}
        placeholder="Search notes"
        className="h-10 rounded-lg bg-card pr-3 pl-9 text-sm"
      />
    </div>
  );
}

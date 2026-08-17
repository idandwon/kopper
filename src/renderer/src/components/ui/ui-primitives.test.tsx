import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "./alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";
import { Label } from "./label";
import { RadioGroup, RadioGroupItem } from "./radio-group";
import { ScrollArea, ScrollBar } from "./scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { Separator } from "./separator";
import { Textarea } from "./textarea";
import { Toast, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "./toast";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

function ToggleHarness() {
  const [value, setValue] = useState("active");
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next.length > 0) setValue(next);
      }}
      aria-label="Note lifecycle view"
    >
      <ToggleGroupItem value="active">Active</ToggleGroupItem>
      <ToggleGroupItem value="completed">Completed</ToggleGroupItem>
    </ToggleGroup>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("shared UI primitives", () => {
  it("exposes a single selected lifecycle value", async () => {
    const user = userEvent.setup();
    render(<ToggleHarness />);

    await user.click(screen.getByRole("button", { name: "Completed" }));

    expect(screen.getByRole("button", { name: "Completed" })).toHaveAttribute(
      "data-state",
      "on",
    );
    expect(screen.getByRole("button", { name: "Completed" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Active" })).toHaveAttribute(
      "data-state",
      "off",
    );
    expect(screen.getByRole("button", { name: "Active" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("associates labels and invalid multiline fields", () => {
    render(
      <>
        <Label htmlFor="body">Body</Label>
        <Textarea id="body" aria-invalid="true" />
      </>,
    );

    expect(screen.getByRole("textbox", { name: "Body" })).toHaveAttribute(
      "data-slot",
      "textarea",
    );
    expect(screen.getByRole("textbox", { name: "Body" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("selects one named radio option", async () => {
    const user = userEvent.setup();
    render(
      <RadioGroup defaultValue="system" aria-label="Color mode">
        <RadioGroupItem value="light" aria-label="Light" />
        <RadioGroupItem value="system" aria-label="System" />
      </RadioGroup>,
    );

    await user.click(screen.getByRole("radio", { name: "Light" }));

    expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "System" })).not.toBeChecked();
  });

  it("preserves the tooltip trigger accessible name", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger aria-label="Theme help">?</TooltipTrigger>
          <TooltipContent>Uses the system appearance.</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    const trigger = screen.getByRole("button", { name: "Theme help" });
    await user.hover(trigger);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Uses the system appearance.",
    );
  });

  it("announces status and error toasts with the requested urgency", async () => {
    render(
      <ToastProvider>
        <Toast open type="background">
          <ToastTitle>Settings saved</ToastTitle>
          <ToastDescription>Your changes are active.</ToastDescription>
        </Toast>
        <Toast open type="foreground">
          <ToastTitle>Save failed</ToastTitle>
          <ToastDescription>Try again.</ToastDescription>
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );

    await waitFor(() => {
      const announcements = screen.getAllByRole("status");
      expect(
        announcements.find((node) =>
          node.textContent?.includes("Settings saved"),
        ),
      ).toHaveAttribute("aria-live", "polite");
      expect(
        announcements.find((node) => node.textContent?.includes("Save failed")),
      ).toHaveAttribute("aria-live", "assertive");
    });
  });

  it("defaults separators to decorative and allows semantic opt-in", () => {
    const { container } = render(
      <>
        <Separator />
        <Separator decorative={false} aria-label="Advanced settings" />
      </>,
    );

    expect(container.querySelector('[data-slot="separator"]')).toHaveAttribute(
      "role",
      "none",
    );
    expect(
      screen.getByRole("separator", { name: "Advanced settings" }),
    ).toBeInTheDocument();
  });

  it("does not render a horizontal scroll bar by default", () => {
    const { container } = render(
      <ScrollArea className="h-20 w-20">
        <div>Scrollable content</div>
      </ScrollArea>,
    );

    expect(
      container.querySelector('[data-slot="scroll-area-viewport"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-orientation="horizontal"]'),
    ).not.toBeInTheDocument();
  });

  it("keeps bounded dialog surfaces vertically scrollable", () => {
    const dialogRender = render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Theme preview</DialogTitle>
          <DialogDescription>Preview both theme modes.</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole("dialog", { name: "Theme preview" })).toHaveClass(
      "overflow-y-auto",
      "overflow-x-hidden",
    );
    dialogRender.unmount();

    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Delete note</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        </AlertDialogContent>
      </AlertDialog>,
    );

    expect(screen.getByRole("alertdialog", { name: "Delete note" })).toHaveClass(
      "overflow-y-auto",
      "overflow-x-hidden",
    );
  });

  it("allows select content width to clamp below a wide trigger", () => {
    render(
      <Select open defaultValue="compact">
        <SelectTrigger aria-label="Density">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="compact">Compact</SelectItem>
        </SelectContent>
      </Select>,
    );

    expect(screen.getByRole("listbox")).toHaveClass(
      "w-[var(--radix-select-trigger-width)]",
      "min-w-0",
      "max-w-[calc(100vw-2rem)]",
    );
  });

  it("does not duplicate an explicitly supplied vertical scroll bar", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );

    const { container } = render(
      <ScrollArea type="always" className="h-20 w-20">
        <div>Scrollable content</div>
        <ScrollBar />
        <ScrollBar orientation="horizontal" />
      </ScrollArea>,
    );

    expect(
      container.querySelectorAll(
        '[data-slot="scroll-area-scrollbar"][data-orientation="vertical"]',
      ),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll(
        '[data-slot="scroll-area-scrollbar"][data-orientation="horizontal"]',
      ),
    ).toHaveLength(1);
  });
});

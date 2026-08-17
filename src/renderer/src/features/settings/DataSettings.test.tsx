import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyDocument } from "../../../../shared/domain/document";
import { DataSettings } from "./DataSettings";

const api = {
  exportData: vi.fn(),
  chooseDataImport: vi.fn(),
  confirmDataImport: vi.fn(),
};

beforeEach(() => {
  api.exportData.mockReset().mockResolvedValue({ ok: true, value: { cancelled: true } });
  api.chooseDataImport.mockReset();
  api.confirmDataImport.mockReset();
});
afterEach(cleanup);

describe("DataSettings", () => {
  it("keeps both data action labels available in a wrapping action row", () => {
    render(<DataSettings api={api} />);
    const exportAction = screen.getByRole("button", { name: "Export data" });

    expect(exportAction).toBeVisible();
    expect(screen.getByRole("button", { name: "Import data" })).toBeVisible();
    expect(exportAction.parentElement).toHaveClass("flex-wrap");
  });

  it("reports cancellation as a successful outcome", async () => {
    const user = userEvent.setup();
    render(<DataSettings api={api} />);
    await user.click(screen.getByRole("button", { name: "Export data" }));
    expect(screen.getByRole("status")).toHaveTextContent("Export cancelled");
  });

  it("shows a complete long import filename and replaces only after explicit confirmation", async () => {
    const user = userEvent.setup();
    const fileName =
      "a-very-long-kopper-backup-filename-that-must-remain-complete-and-readable.json";
    api.chooseDataImport.mockResolvedValue({
      ok: true,
      value: {
        token: "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5",
        fileName,
        noteCount: 3,
        sectionCount: 2,
      },
    });
    api.confirmDataImport.mockResolvedValue({
      ok: true,
      value: createEmptyDocument(new Date("2026-08-16T12:00:00.000Z")),
    });
    render(<DataSettings api={api} />);

    await user.click(screen.getByRole("button", { name: "Import data" }));
    expect(api.confirmDataImport).not.toHaveBeenCalled();
    const description = screen.getByText(
      new RegExp(`${fileName}.*3 notes.*2 sections`, "i"),
    );
    expect(description).toBeVisible();
    expect(description).toHaveClass("break-words");
    await user.click(screen.getByRole("button", { name: "Replace current data" }));
    expect(api.confirmDataImport).toHaveBeenCalledWith("0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5");
    expect(screen.getByRole("status")).toHaveTextContent("Import complete");
  });
});

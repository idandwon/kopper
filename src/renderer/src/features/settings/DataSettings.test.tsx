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
  it("reports cancellation as a successful outcome", async () => {
    const user = userEvent.setup();
    render(<DataSettings api={api} />);
    await user.click(screen.getByRole("button", { name: "Export data" }));
    expect(screen.getByRole("status")).toHaveTextContent("Export cancelled");
  });

  it("shows import counts and replaces only after explicit confirmation", async () => {
    const user = userEvent.setup();
    api.chooseDataImport.mockResolvedValue({
      ok: true,
      value: {
        token: "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5",
        fileName: "chosen.json",
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
    expect(screen.getByText(/chosen\.json.*3 notes.*2 sections/i)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Replace current data" }));
    expect(api.confirmDataImport).toHaveBeenCalledWith("0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5");
    expect(screen.getByRole("status")).toHaveTextContent("Import complete");
  });
});

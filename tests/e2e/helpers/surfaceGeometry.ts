import { expect, type Locator, type Page } from "@playwright/test";

const EDGE_TOLERANCE = 0.5;

export async function setSurfaceSize(
  page: Page,
  width: number,
  height: number,
): Promise<void> {
  await page.setViewportSize({ width, height });
  await expect
    .poll(() =>
      page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      })),
    )
    .toEqual({ width, height });
}

export async function expectSurfaceContained(
  page: Page,
  expectedOwner: string,
): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(
          document.querySelectorAll<HTMLElement>("[data-scroll-owner]"),
        )
          .filter((owner) => owner.getClientRects().length > 0)
          .map((owner) => owner.dataset.scrollOwner ?? ""),
      ),
    )
    .toEqual([expectedOwner]);

  const geometry = await page.evaluate(() => {
    const root = document.documentElement;
    const hasLayout = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return (
        element.getClientRects().length > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        element.closest("[hidden]") === null
      );
    };
    const owners = Array.from(
      document.querySelectorAll<HTMLElement>("[data-scroll-owner]"),
    ).filter(hasLayout);
    const measuredElements = Array.from(
      document.querySelectorAll<HTMLElement>("body *"),
    ).filter(
      (element) =>
        hasLayout(element) &&
        // Radix focus guards are intentionally fixed, visually clipped
        // accessibility sentinels rather than renderer surface content.
        element.closest("[data-radix-focus-guard]") === null,
    );
    const rightEdges = measuredElements.map(
      (element) => element.getBoundingClientRect().right,
    );

    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      clientHeight: root.clientHeight,
      scrollHeight: root.scrollHeight,
      owners: owners.map((owner) => owner.dataset.scrollOwner ?? ""),
      rightEdges,
    };
  });

  expect(geometry.scrollWidth).toBe(geometry.clientWidth);
  expect(geometry.scrollHeight).toBe(geometry.clientHeight);
  expect(geometry.owners).toEqual([expectedOwner]);
  expect(Math.max(...geometry.rightEdges)).toBeLessThanOrEqual(
    geometry.clientWidth + EDGE_TOLERANCE,
  );
}

export async function expectOverlayContained(
  page: Page,
  overlay: Locator,
): Promise<void> {
  await expect(overlay).toBeVisible();
  await expect(overlay).toBeInViewport();
  const viewport = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  }));
  await expect
    .poll(async () => {
      const bounds = await overlay.boundingBox();
      return (
        bounds !== null &&
        bounds.x >= -EDGE_TOLERANCE &&
        bounds.y >= -EDGE_TOLERANCE &&
        bounds.x + bounds.width <= viewport.width + EDGE_TOLERANCE &&
        bounds.y + bounds.height <= viewport.height + EDGE_TOLERANCE
      );
    })
    .toBe(true);
  const bounds = await overlay.boundingBox();

  expect(bounds).not.toBeNull();
  if (bounds === null) return;
  expect(bounds.x).toBeGreaterThanOrEqual(-EDGE_TOLERANCE);
  expect(bounds.y).toBeGreaterThanOrEqual(-EDGE_TOLERANCE);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(
    viewport.width + EDGE_TOLERANCE,
  );
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(
    viewport.height + EDGE_TOLERANCE,
  );
}

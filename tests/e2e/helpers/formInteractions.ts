import type { Locator } from "@playwright/test";

import { expect } from "../fixtures/electronApp";

export async function fillExactly(
  locator: Locator,
  value: string,
): Promise<void> {
  await expect(async () => {
    await locator.fill(value);
    await expect(locator).toHaveValue(value);
  }).toPass();
}

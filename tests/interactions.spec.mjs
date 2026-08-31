import { expect, test } from "@playwright/test";
import { gotoSettled } from "./helpers/browser.mjs";

test("navigation drawer traps focus, closes on Escape, and restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await gotoSettled(page, "/");

  const toggle = page.locator("[data-nav-toggle]");
  await expect(toggle).toBeVisible();
  await toggle.focus();
  await page.keyboard.press("Enter");

  const drawer = page.locator("#site-nav-drawer");
  await expect(drawer).toHaveAttribute("aria-hidden", "false");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.closest("#site-nav-drawer") !== null))
    .toBe(true);

  const focusables = drawer.locator(
    "a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
  );
  const count = await focusables.count();
  expect(count).toBeGreaterThan(1);
  await focusables.nth(count - 1).focus();
  await page.keyboard.press("Tab");
  await expect(focusables.first()).toBeFocused();
  await focusables.first().focus();
  await page.keyboard.press("Shift+Tab");
  await expect(focusables.nth(count - 1)).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(drawer).toHaveAttribute("aria-hidden", "true");
  await expect(toggle).toBeFocused();
});

test("custom FAQ is keyboard operable and exposes its state", async ({ page }) => {
  await gotoSettled(page, "/");
  const buttons = page.locator("[data-faq] button[data-faq-target]");
  expect(await buttons.count()).toBeGreaterThan(1);
  const target = buttons.nth(1);
  await target.focus();
  await page.keyboard.press("Enter");
  await expect(target).toHaveAttribute("aria-expanded", "true");
  const controlledId = await target.getAttribute("aria-controls");
  expect(controlledId).toBeTruthy();
  await expect(page.locator(`#${controlledId}`)).toBeVisible();
});

test("native details FAQ is keyboard operable", async ({ page }) => {
  await gotoSettled(page, "/commercial-interior-design-montreal/");
  const summary = page.locator("#faq details summary").first();
  await expect(summary).toBeVisible();
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(summary.locator("xpath=..")).toHaveAttribute("open", "");
});

for (const route of ["/contact/", "/inquiry/"]) {
  test(`${route} exposes native validation from the keyboard`, async ({ page }) => {
    await gotoSettled(page, route);
    const form = page.locator("form[data-lead-form]");
    const submit = form.locator('[type="submit"]');
    await submit.focus();
    await page.keyboard.press("Enter");
    const status = form.locator("[data-form-status]");
    await expect(status).toHaveAttribute("data-state", "error");
    await expect(status).toContainText(/correct|field|required/i);
    await expect(form.locator(":invalid").first()).toBeFocused();
  });
}

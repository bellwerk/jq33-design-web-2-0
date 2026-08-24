import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  gotoNotFoundSettled,
  gotoSettled,
  horizontalOverflow,
} from "./helpers/browser.mjs";
import { notFoundRoute, publicRoutes } from "./helpers/site.mjs";

const axeTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectNoBlockingAxeViolations(page, testInfo, attachmentName) {
  const results = await new AxeBuilder({ page }).withTags(axeTags).analyze();
  const blocking = results.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact),
  );
  await testInfo.attach(attachmentName, {
    body: Buffer.from(JSON.stringify(results, null, 2)),
    contentType: "application/json",
  });
  expect(
    blocking.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
}

async function fillRequiredLeadFields(form) {
  const controls = form.locator(
    "input[required]:not([type='hidden']), select[required], textarea[required]",
  );
  for (let index = 0; index < (await controls.count()); index += 1) {
    const control = controls.nth(index);
    const tagName = await control.evaluate((element) => element.tagName.toLowerCase());
    const type = ((await control.getAttribute("type")) || "text").toLowerCase();
    if (tagName === "select") {
      const value = await control.locator("option:not([disabled])").nth(1).getAttribute("value");
      await control.selectOption(value);
    } else {
      await control.fill(
        type === "email"
          ? "axe-state@example.test"
          : tagName === "textarea"
            ? "Accessible error-state audit project details."
            : "Accessible state audit",
      );
    }
  }
}

for (const route of publicRoutes) {
  test(`${route} has zero serious or critical axe violations`, async ({ page }, testInfo) => {
    await gotoSettled(page, route);
    await expectNoBlockingAxeViolations(page, testInfo, "axe-results");
  });

  test(`${route} passes an automated 640 CSS-pixel reflow approximation (not manual 200 percent browser zoom proof)`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 640, height: 900 });
    await gotoSettled(page, route);
    const overflow = await horizontalOverflow(page);
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    const hiddenActions = await page.evaluate(() =>
      [...document.querySelectorAll("a[href], button, input, select, textarea, summary")]
        .filter((element) => {
          if (element.closest("[inert], [aria-hidden='true']")) return false;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            (rect.left < -1 || rect.right > document.documentElement.clientWidth + 1)
          );
        })
        .map((element) => element.outerHTML.slice(0, 160)),
    );
    expect(hiddenActions).toEqual([]);
    await testInfo.attach("automated-reflow-approximation-scope", {
      body: Buffer.from(
        JSON.stringify(
          {
            approximation: true,
            cssViewport: { width: 640, height: 900 },
            manualBrowserZoom200PercentProven: false,
            limitation:
              "A CSS-viewport reflow check cannot reproduce browser zoom, OS scaling, assistive technology, or text-only zoom. Manual 200% browser-zoom verification remains required.",
          },
          null,
          2,
        ),
      ),
      contentType: "application/json",
    });
  });

  test(`${route} honors reduced motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoSettled(page, route);
    const violations = await page.evaluate(() => {
      const parseTimes = (value) =>
        value.split(",").map((part) => {
          const token = part.trim();
          return token.endsWith("ms")
            ? Number.parseFloat(token)
            : Number.parseFloat(token) * 1000;
        });
      const results = [];
      for (const element of document.querySelectorAll("*")) {
        const style = getComputedStyle(element);
        const animation = parseTimes(style.animationDuration);
        const transition = parseTimes(style.transitionDuration);
        if (
          animation.some((duration) => duration > 20) ||
          transition.some((duration) => duration > 20) ||
          style.scrollBehavior === "smooth"
        ) {
          results.push({
            element: element.outerHTML.slice(0, 120),
            animation: style.animationDuration,
            transition: style.transitionDuration,
            scrollBehavior: style.scrollBehavior,
          });
        }
      }
      return results.slice(0, 20);
    });
    expect(violations).toEqual([]);
  });
}

test("open navigation drawer has zero serious or critical axe violations", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await gotoSettled(page, "/");
  await page.locator("[data-nav-toggle]").click();
  await expect(page.locator("#site-nav-drawer")).toHaveAttribute("aria-hidden", "false");
  await expectNoBlockingAxeViolations(page, testInfo, "axe-open-drawer");
});

test("branded 404 has zero serious or critical axe violations", async ({
  page,
}, testInfo) => {
  await gotoNotFoundSettled(page, notFoundRoute);
  await expectNoBlockingAxeViolations(page, testInfo, "axe-branded-404");
});

test("open custom FAQ state has zero serious or critical axe violations", async ({
  page,
}, testInfo) => {
  await gotoSettled(page, "/");
  const trigger = page.locator("[data-faq] button[data-faq-target]").first();
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expectNoBlockingAxeViolations(page, testInfo, "axe-open-custom-faq");
});

test("open native FAQ state has zero serious or critical axe violations", async ({
  page,
}, testInfo) => {
  await gotoSettled(page, "/commercial-interior-design-montreal/");
  const details = page.locator("#faq details").first();
  await details.locator("summary").click();
  await expect(details).toHaveAttribute("open", "");
  await expectNoBlockingAxeViolations(page, testInfo, "axe-open-native-faq");
});

for (const route of ["/contact/", "/inquiry/"]) {
  test(`${route} validation state has zero serious or critical axe violations`, async ({
    page,
  }, testInfo) => {
    await gotoSettled(page, route);
    await page.locator("form[data-lead-form]").evaluate((form) => form.requestSubmit());
    await expect(page.locator("[data-form-status]")).toHaveAttribute("data-state", "error");
    await expectNoBlockingAxeViolations(page, testInfo, "axe-validation-state");
  });

  test(`${route} provider error and retry state has zero serious or critical axe violations`, async ({
    page,
  }, testInfo) => {
    await page.route("https://formspree.io/**", async (intercepted) => {
      await intercepted.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ errors: [] }),
      });
    });
    await gotoSettled(page, route);
    const form = page.locator("form[data-lead-form]");
    await fillRequiredLeadFields(form);
    await form.locator('[type="submit"]').click();
    await expect(form.locator("[data-form-status]")).toHaveAttribute("data-state", "error");
    await expect(form.locator("[data-form-retry]")).toBeVisible();
    await expectNoBlockingAxeViolations(page, testInfo, "axe-provider-error-retry-state");
  });
}

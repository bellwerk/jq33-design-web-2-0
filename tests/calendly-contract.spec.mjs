import { expect, test } from "@playwright/test";
import {
  gotoNotFoundSettled,
  gotoSettled,
} from "./helpers/browser.mjs";
import { notFoundRoute, publicRoutes } from "./helpers/site.mjs";

const documents = [
  ...publicRoutes.map((route) => ({ route, status: 200 })),
  { route: notFoundRoute, status: 404 },
];

function directCalendlyEndpoint(value, label) {
  const endpoint = new URL(value);
  expect(endpoint.protocol, `${label} must use HTTPS`).toBe("https:");
  expect(endpoint.hostname, `${label} must use Calendly directly`).toBe("calendly.com");
  expect(endpoint.port, `${label} must not override the HTTPS port`).toBe("");
  expect(endpoint.username, `${label} must not contain credentials`).toBe("");
  expect(endpoint.password, `${label} must not contain credentials`).toBe("");
  expect(endpoint.search, `${label} must not contain tracking or routing query data`).toBe("");
  expect(endpoint.hash, `${label} must not contain a fragment`).toBe("");
  expect(
    endpoint.pathname,
    `${label} must identify one owner and one event, never a profile root`,
  ).toMatch(/^\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/);
  return endpoint.href;
}

test("every booking CTA, including every mobile drawer, resolves to one direct event", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const routes = [];
  const endpoints = new Set();

  for (const documentCase of documents) {
    if (documentCase.status === 404) {
      await gotoNotFoundSettled(page, documentCase.route);
    } else {
      await gotoSettled(page, documentCase.route);
    }

    const renderedLinks = page.locator("a[data-calendly-cta]");
    const renderedCount = await renderedLinks.count();
    expect(
      renderedCount,
      `${documentCase.route} must render at least the shared drawer booking CTA`,
    ).toBeGreaterThan(0);

    const hrefs = await renderedLinks.evaluateAll((links) =>
      links.map((link) => ({
        href: link.href,
        rel: link.rel,
        target: link.target,
        text: link.textContent.replace(/\s+/g, " ").trim(),
      })),
    );
    for (const [index, link] of hrefs.entries()) {
      const label = `${documentCase.route} booking CTA ${index + 1} (${link.text})`;
      endpoints.add(directCalendlyEndpoint(link.href, label));
    }

    const toggle = page.locator("[data-nav-toggle]");
    await expect(toggle).toBeVisible();
    await toggle.click();
    const drawer = page.locator("#site-nav-drawer");
    await expect(drawer).toHaveAttribute("aria-hidden", "false");
    const drawerCta = drawer.locator("a[data-calendly-cta]");
    await expect(drawerCta).toBeVisible();
    const drawerEndpoint = directCalendlyEndpoint(
      await drawerCta.getAttribute("href"),
      `${documentCase.route} open mobile drawer CTA`,
    );
    endpoints.add(drawerEndpoint);

    routes.push({
      route: documentCase.route,
      renderedCount,
      endpoints: hrefs.map((link) => link.href),
      drawerEndpoint,
    });
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveAttribute("aria-hidden", "true");
  }

  expect(
    [...endpoints],
    "Every booking surface across every route must resolve to the same direct Calendly event",
  ).toHaveLength(1);
  expect(
    [...endpoints][0],
    "Booking CTAs must never resolve to the local Inquiry route",
  ).not.toContain("/inquiry/");

  await testInfo.attach("calendly-route-contract", {
    body: Buffer.from(JSON.stringify({ canonicalEndpoint: [...endpoints][0], routes }, null, 2)),
    contentType: "application/json",
  });
});

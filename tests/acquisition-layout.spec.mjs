import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { gotoSettled } from "./helpers/browser.mjs";
import { repositoryRoot } from "./helpers/site.mjs";

const routes = [
  "/commercial-interior-design-montreal/",
  "/contact/",
  "/inquiry/",
  "/planning-resources/",
  "/journal/",
  "/journal/commercial-interior-design-cost-montreal/",
  "/journal/before-you-sign-a-commercial-lease/",
  "/journal/salon-layout-planning-checklist/",
];
const viewports = [320, 375, 414, 768, 1280, 1440].map((width) => ({
  width,
  height: width === 1280 ? 720 : 900,
}));

test("owner-preserved home hero markup and typography rules match the intake baseline", async () => {
  const source = fs.readFileSync(path.join(repositoryRoot, "index.html"), "utf8").replaceAll("\r\n", "\n");
  const hero = source.match(/<section\b[^>]*id="home"[^>]*>[\s\S]*?<\/section>/)?.[0];
  const heroRules = [...source.matchAll(/[^{}]*\.panel--home[^{}]*\{[^{}]*\}/g)]
    .map((row) => row[0].trim()).join("\n");
  const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
  expect(hero, "The existing photographic home hero must remain present").toBeTruthy();
  // Hashes were frozen from the owner-approved dirty checkout in this task's raw/baseline-source.
  expect(sha256(hero), "Keep the photograph, small purple copy, brand mark, and hero actions intact")
    .toBe("4f84716415283d1ea6ce9e332d0d09d0f2166d4207cd62f62b85f7afd9869748");
  expect(sha256(heroRules), "Keep all existing home hero style declarations")
    .toBe("61550d4a247a721eec8aecff14b56a85498f37a278fa25ae453d9809e9ad1bff");
});

for (const viewport of viewports) {
  test(`acquisition headings clear the header at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const measurements = [];
    for (const route of routes) {
      await gotoSettled(page, route);
      const geometry = await page.evaluate(() => {
        const header = document.querySelector("header.header-nav").getBoundingClientRect();
        const heading = document.querySelector("main h1");
        const rect = heading.getBoundingClientRect();
        const style = getComputedStyle(heading);
        return {
          headerBottom: header.bottom,
          heading: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width },
          headingText: heading.textContent.trim(),
          headingFont: style.fontFamily,
          headingVisible: style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0,
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        };
      });
      measurements.push({ route, viewport, ...geometry });
      expect(geometry.headingVisible, `${route} must expose its first heading`).toBe(true);
      expect(geometry.headingFont, `${route} must retain expressive Permanent Marker headings`).toContain("Permanent Marker");
      expect(geometry.heading.top, `${route} heading must start below the fixed header`).toBeGreaterThanOrEqual(geometry.headerBottom + 15);
      expect(geometry.heading.top, `${route} heading must begin in the initial viewport`).toBeLessThan(viewport.height);
      expect(geometry.heading.left).toBeGreaterThanOrEqual(-1);
      expect(geometry.heading.right).toBeLessThanOrEqual(geometry.clientWidth + 1);
      expect(geometry.scrollWidth, `${route} must not overflow horizontally`).toBeLessThanOrEqual(geometry.clientWidth + 1);
      if (route === "/commercial-interior-design-montreal/") {
        const wordLineCount = await page.locator("main h1").evaluate((heading) => {
          const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const node = walker.currentNode;
            const start = node.textContent.indexOf("Commercial");
            if (start < 0) continue;
            const range = document.createRange();
            range.setStart(node, start);
            range.setEnd(node, start + "Commercial".length);
            return new Set([...range.getClientRects()].filter(rect => rect.width > 0).map(rect => Math.round(rect.top))).size;
          }
          return 0;
        });
        expect(wordLineCount, "The Service heading must keep Commercial as one word").toBe(1);
      }
      if ([375, 1280].includes(viewport.width)) {
        await testInfo.attach(`${route.replaceAll("/", "-")}first-screen`, {
          body: await page.screenshot({ fullPage: false, animations: "disabled" }),
          contentType: "image/png",
        });
      }
    }
    await testInfo.attach("heading-clearance-measurements", {
      body: Buffer.from(JSON.stringify(measurements, null, 2)),
      contentType: "application/json",
    });
    await gotoSettled(page, "/");
    await testInfo.attach(`preserved-home-${viewport.width}`, {
      body: await page.screenshot({ fullPage: false, animations: "disabled" }),
      contentType: "image/png",
    });
  });
}

import { expect, test } from "@playwright/test";
import {
  gotoSettled,
  gotoSettledWithStatus,
  horizontalOverflow,
  nonActionLayoutCollisions,
} from "./helpers/browser.mjs";
import { notFoundRoute, publicRoutes, viewports } from "./helpers/site.mjs";

const responsiveRoutes = [
  ...publicRoutes.map((route) => ({ route, status: 200 })),
  { route: notFoundRoute, status: 404 },
];

for (const { route, status } of responsiveRoutes) {
  for (const viewport of viewports) {
    test(`${route} is stable at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      if (status === 200) await gotoSettled(page, route);
      else await gotoSettledWithStatus(page, route, status);

      const overflow = await horizontalOverflow(page);
      expect(
        overflow.scrollWidth,
        `${route} overflows horizontally at ${viewport.width}x${viewport.height}`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);
      const nonActionCollisions = await nonActionLayoutCollisions(page);
      expect(
        nonActionCollisions,
        "Normal-flow, non-action sibling regions must not materially collide",
      ).toEqual([]);

      const geometry = await page.evaluate(() => {
        const isVisible = (element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity) > 0 &&
            rect.width > 1 &&
            rect.height > 1 &&
            !element.closest("[inert], [aria-hidden='true']")
          );
        };
        const actionSelector =
          "a[href], button, input:not([type='hidden']), select, textarea, summary, [role='button'], [tabindex]:not([tabindex='-1'])";
        const actions = [...document.querySelectorAll(actionSelector)].filter(isVisible);
        const requiresSingleLineLabel = (action) => {
          if (action.matches("button, [role='button'], input[type='button'], input[type='submit'], input[type='reset']")) {
            return true;
          }
          if (!action.matches("a[href]")) return false;

          const style = getComputedStyle(action);
          if (style.writingMode !== "horizontal-tb") return false;
          if (action.closest("article, [class*='card']")) return false;

          const classNames = [...action.classList];
          const hasControlClass = classNames.some((className) =>
            /(?:^|-)(?:button|btn|cta|action|booking|submit)(?:-|$)/i.test(className),
          );
          return Boolean(
            action.matches(".project-back-link, .next-article") ||
            action.closest(
              "header nav, #site-nav-drawer, .site-footer, [data-component='footer'], [role='navigation']",
            ) ||
              hasControlClass,
          );
        };
        const wrapped = [];
        const offCanvas = [];
        for (const action of actions) {
          const rect = action.getBoundingClientRect();
          if (rect.left < -1 || rect.right > document.documentElement.clientWidth + 1) {
            offCanvas.push(action.outerHTML.slice(0, 180));
          }
          const text = (action.innerText || action.value || action.getAttribute("aria-label") || "")
            .replace(/\s+/g, " ")
            .trim();
          if (!text || !requiresSingleLineLabel(action)) continue;
          if (action.matches(".nav-logo, .nav-item:has(.nav-logo)")) continue;
          const range = document.createRange();
          range.selectNodeContents(action);
          const lines = [...range.getClientRects()].filter(
            (line) => line.width > 1 && line.height > 1,
          );
          const distinctTops = new Set(lines.map((line) => Math.round(line.top)));
          if (distinctTops.size > 1) wrapped.push(`${text} (${distinctTops.size} lines)`);
        }

        const overlaps = [];
        for (let i = 0; i < actions.length; i += 1) {
          for (let j = i + 1; j < actions.length; j += 1) {
            const first = actions[i];
            const second = actions[j];
            if (first.contains(second) || second.contains(first)) continue;
            const a = first.getBoundingClientRect();
            const b = second.getBoundingClientRect();
            const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
            const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
            const area = width * height;
            const smaller = Math.min(a.width * a.height, b.width * b.height);
            if (area > 4 && smaller > 0 && area / smaller > 0.15) {
              overlaps.push(
                `${(first.innerText || first.getAttribute("aria-label") || first.tagName).trim()} <> ${(second.innerText || second.getAttribute("aria-label") || second.tagName).trim()}`,
              );
            }
          }
        }
        return { wrapped, offCanvas, overlaps };
      });

      const firstGeometry = await page.evaluate(() =>
        [...document.querySelectorAll("header, main, main > section, footer, img")]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return style.display !== "none" && rect.width > 0 && rect.height > 0;
          })
          .map((element, index) => {
            const rect = element.getBoundingClientRect();
            return {
              key: element.id || `${element.tagName}:${index}`,
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            };
          }),
      );
      await page.waitForTimeout(250);
      const secondGeometry = await page.evaluate(() =>
        [...document.querySelectorAll("header, main, main > section, footer, img")]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return style.display !== "none" && rect.width > 0 && rect.height > 0;
          })
          .map((element, index) => {
            const rect = element.getBoundingClientRect();
            return {
              key: element.id || `${element.tagName}:${index}`,
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            };
          }),
      );
      const lateMovement = firstGeometry.flatMap((first) => {
        const second = secondGeometry.find((entry) => entry.key === first.key);
        if (!second) return [`${first.key} disappeared after settling`];
        const maximumDelta = Math.max(
          Math.abs(first.x - second.x),
          Math.abs(first.y - second.y),
          Math.abs(first.width - second.width),
          Math.abs(first.height - second.height),
        );
        return maximumDelta > 2 ? [`${first.key} moved ${maximumDelta.toFixed(2)}px`] : [];
      });

      expect(geometry.offCanvas, "Visible focus targets must stay on canvas").toEqual([]);
      expect(geometry.wrapped, "Action labels must remain on one readable line").toEqual([]);
      expect(geometry.overlaps, "Visible actionable elements must not overlap").toEqual([]);
      expect(lateMovement, "Geometry must remain stable after assets settle").toEqual([]);

      const screenshotPath = testInfo.outputPath("full-page.png");
      await page.screenshot({ path: screenshotPath, fullPage: true });
      await testInfo.attach("responsive-metrics", {
        body: Buffer.from(
          JSON.stringify(
            {
              route,
              viewport,
              overflow,
              nonActionCollisions,
              geometry,
              lateMovement,
            },
            null,
            2,
          ),
        ),
        contentType: "application/json",
      });
      await testInfo.attach("full-page", {
        path: screenshotPath,
        contentType: "image/png",
      });
    });
  }
}

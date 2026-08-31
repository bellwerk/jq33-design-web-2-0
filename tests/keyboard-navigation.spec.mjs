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

const colorIsTransparent = (value) => {
  const normalized = String(value).replace(/\s+/g, "").toLowerCase();
  return (
    normalized === "transparent" ||
    normalized === "rgba(0,0,0,0)" ||
    normalized.endsWith(",0)")
  );
};

async function instrumentSequentialFocusOrder(page) {
  return page.evaluate(() => {
    const selector = [
      "a[href]",
      "area[href]",
      "button",
      "input:not([type='hidden'])",
      "select",
      "textarea",
      "summary",
      "iframe",
      "[contenteditable='true']",
      "[tabindex]",
    ].join(",");
    const candidates = [...document.querySelectorAll(selector)].filter((element) => {
      if (!(element instanceof HTMLElement)) return false;
      if (element.matches(":disabled") || element.tabIndex < 0) return false;
      if (element.closest("[inert], [aria-hidden='true']")) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.visibility !== "collapse" &&
        rect.width > 0 &&
        rect.height > 0
      );
    });

    const ordered = candidates
      .map((element, documentIndex) => ({
        element,
        documentIndex,
        tabIndex: element.tabIndex,
      }))
      .sort((left, right) => {
        const leftPositive = left.tabIndex > 0;
        const rightPositive = right.tabIndex > 0;
        if (leftPositive !== rightPositive) return leftPositive ? -1 : 1;
        if (leftPositive && left.tabIndex !== right.tabIndex) {
          return left.tabIndex - right.tabIndex;
        }
        return left.documentIndex - right.documentIndex;
      });

    return ordered.map(({ element }, index) => {
      const proofId = `keyboard-proof-${index}`;
      element.dataset.jq33KeyboardProof = proofId;
      const label =
        element.getAttribute("aria-label") ||
        element.innerText ||
        element.getAttribute("name") ||
        element.getAttribute("href") ||
        element.tagName;
      return {
        id: proofId,
        label: label.replace(/\s+/g, " ").trim().slice(0, 120),
        tagName: element.tagName,
      };
    });
  });
}

for (const documentCase of documents) {
  test(`${documentCase.route} exposes every sequential control through keyboard-only Tab traversal`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    if (documentCase.status === 404) {
      await gotoNotFoundSettled(page, documentCase.route);
    } else {
      await gotoSettled(page, documentCase.route);
    }

    const expected = await instrumentSequentialFocusOrder(page);
    expect(expected.length, "Every interactive document must have keyboard targets").toBeGreaterThan(
      0,
    );
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });

    const reached = [];
    for (const expectedTarget of expected) {
      await page.keyboard.press("Tab");
      const actual = await page.evaluate(() => {
        const element = document.activeElement;
        if (!(element instanceof HTMLElement)) return null;
        const rect = element.getBoundingClientRect();
        return {
          id: element.dataset.jq33KeyboardProof || "",
          label:
            element.getAttribute("aria-label") ||
            element.innerText ||
            element.getAttribute("name") ||
            element.getAttribute("href") ||
            element.tagName,
          geometry: {
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
          },
        };
      });
      expect(actual?.id, `Tab must reach ${expectedTarget.label}`).toBe(expectedTarget.id);
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const element = document.activeElement;
              if (!(element instanceof HTMLElement)) return false;
              const rect = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              return (
                rect.bottom > 0 &&
                rect.top < innerHeight &&
                Number(style.opacity) > 0 &&
                element.matches(":focus-visible")
              );
            }),
          {
            message: `${expectedTarget.label} must finish keyboard-triggered scrolling into view`,
            timeout: 1_500,
          },
        )
        .toBe(true);
      const settledGeometry = await page.evaluate(() => {
        const rect = document.activeElement.getBoundingClientRect();
        return {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          viewportWidth: innerWidth,
          viewportHeight: innerHeight,
          opacity: Number(getComputedStyle(document.activeElement).opacity),
          focusVisible: document.activeElement.matches(":focus-visible"),
          outlineColor: getComputedStyle(document.activeElement).outlineColor,
          outlineStyle: getComputedStyle(document.activeElement).outlineStyle,
          outlineWidth: Number.parseFloat(
            getComputedStyle(document.activeElement).outlineWidth,
          ),
        };
      });
      actual.geometry = settledGeometry;
      reached.push(actual);
      expect(actual.geometry.right, `${expectedTarget.label} must be horizontally reachable`).toBeGreaterThan(
        0,
      );
      expect(actual.geometry.left, `${expectedTarget.label} must be horizontally reachable`).toBeLessThan(
        actual.geometry.viewportWidth,
      );
      expect(actual.geometry.opacity, `${expectedTarget.label} must be visibly rendered`).toBeGreaterThan(
        0,
      );
      expect(
        actual.geometry.focusVisible,
        `${expectedTarget.label} must enter :focus-visible through Tab traversal`,
      ).toBe(true);
      expect(
        actual.geometry.outlineStyle,
        `${expectedTarget.label} must expose a visible focus outline`,
      ).not.toBe("none");
      expect(
        actual.geometry.outlineWidth,
        `${expectedTarget.label} focus outline must be at least 2 CSS pixels`,
      ).toBeGreaterThanOrEqual(2);
      expect(
        colorIsTransparent(actual.geometry.outlineColor),
        `${expectedTarget.label} focus outline must not be transparent`,
      ).toBe(false);
    }

    await testInfo.attach("keyboard-tab-traversal", {
      body: Buffer.from(JSON.stringify({ expected, reached }, null, 2)),
      contentType: "application/json",
    });
  });
}

import { expect, test } from "@playwright/test";
import { gotoSettled } from "./helpers/browser.mjs";
import { notFoundRoute, publicRoutes } from "./helpers/site.mjs";

const minimumWidth = 320;
const maximumWidth = 1920;
const sweepHeight = 800;
const expectedWidths = maximumWidth - minimumWidth + 1;
const routes = [
  ...publicRoutes.map((route) => ({ route, status: 200 })),
  { route: notFoundRoute, status: 404 },
];

test.describe("Hallmark continuous responsive gates", () => {
  test.use({ bypassCSP: true, reducedMotion: "reduce" });

  test("all required routes avoid horizontal scroll and wrapped affordances from 320px through 1920px", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: maximumWidth, height: sweepHeight });
    await gotoSettled(page, "/");

    await page.route("**/*", async (route) => {
      const request = route.request();
      if (request.resourceType() !== "document" || request.frame() === page.mainFrame()) {
        await route.continue();
        return;
      }

      const response = await route.fetch();
      const headers = { ...response.headers() };
      delete headers["content-security-policy"];
      delete headers["content-security-policy-report-only"];
      delete headers["x-frame-options"];
      await route.fulfill({ response, headers });
    });

    await page.evaluate(({ width, height }) => {
      document.documentElement.style.margin = "0";
      document.documentElement.style.padding = "0";
      document.body.style.margin = "0";
      document.body.style.padding = "0";
      document.body.replaceChildren();

      const frame = document.createElement("iframe");
      frame.id = "hallmark-responsive-continuum-frame";
      frame.name = "hallmark-responsive-continuum-frame";
      frame.setAttribute("title", "Hallmark responsive continuum test frame");
      frame.style.display = "block";
      frame.style.width = `${width}px`;
      frame.style.height = `${height}px`;
      frame.style.border = "0";
      document.body.append(frame);
    }, { width: maximumWidth, height: sweepHeight });

    const proof = {
      artifactSha256: testInfo.config.metadata.artifactSha256,
      maximumWidth,
      minimumWidth,
      routeWidthPairs: 0,
      routes: [],
      widthsPerRoute: expectedWidths,
    };
    const failures = [];

    for (const { route, status } of routes) {
      const targetUrl = new URL(route, page.url()).href;
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url() === targetUrl &&
          response.request().resourceType() === "document" &&
          response.request().frame() !== page.mainFrame(),
      );
      const loadPromise = page.evaluate((url) => {
        const frame = document.getElementById("hallmark-responsive-continuum-frame");
        return new Promise((resolve, reject) => {
          const timeout = window.setTimeout(
            () => reject(new Error(`Timed out loading responsive sweep frame: ${url}`)),
            15_000,
          );
          frame.addEventListener(
            "load",
            () => {
              window.clearTimeout(timeout);
              resolve();
            },
            { once: true },
          );
          frame.src = url;
        });
      }, targetUrl);
      const [response] = await Promise.all([responsePromise, loadPromise]);
      expect(response.status(), `Unexpected sweep-frame status for ${route}`).toBe(status);

      const routeProof = await page.evaluate(
        async ({ minimumWidth, maximumWidth }) => {
          const frame = document.getElementById("hallmark-responsive-continuum-frame");
          const frameWindow = frame.contentWindow;
          const frameDocument = frame.contentDocument;
          if (!frameWindow || !frameDocument?.documentElement || !frameDocument.body) {
            throw new Error("Responsive sweep frame is not same-origin or did not initialize");
          }

          const deadline = Date.now() + 10_000;
          while (
            frameDocument.querySelector('link[rel="stylesheet"][data-jq33-deferred-css]') &&
            frameDocument.documentElement.dataset.jq33Css !== "ready"
          ) {
            if (Date.now() > deadline) {
              throw new Error("Responsive sweep frame deferred CSS did not become ready");
            }
            await new Promise((resolve) => frameWindow.setTimeout(resolve, 10));
          }
          if (frameDocument.fonts?.ready) await frameDocument.fonts.ready;

          const stabilizer = frameDocument.createElement("style");
          stabilizer.textContent =
            "*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}";
          frameDocument.head.append(stabilizer);
          await new Promise((resolve) =>
            frameWindow.requestAnimationFrame(() => frameWindow.requestAnimationFrame(resolve)),
          );

          const actionSelector =
            "a[href], button, input:not([type='hidden']), select, textarea, summary, [role='button'], [tabindex]:not([tabindex='-1'])";
          const routeFailures = [];
          const failureSampleKeys = new Set();
          const failureCounts = { 34: 0, 49: 0 };
          const failureKindSummaries = {};
          const failureWidthRanges = {
            34: { first: null, last: null },
            49: { first: null, last: null },
          };
          let actionChecks = 0;
          let failureCount = 0;
          let maximumOverflow = 0;
          let maximumRenderedLines = 0;
          let openDrawerWidthChecks = 0;

          const recordFailure = (width, gate, kind, detail) => {
            failureCount += 1;
            failureCounts[gate] += 1;
            failureWidthRanges[gate].first ??= width;
            failureWidthRanges[gate].last = width;
            const kindKey = `${gate}:${kind}`;
            const kindSummary = (failureKindSummaries[kindKey] ??= {
              count: 0,
              firstWidth: width,
              gate,
              kind,
              lastWidth: width,
              samples: [],
            });
            kindSummary.count += 1;
            kindSummary.lastWidth = width;

            const sampleKey = `${gate}:${kind}:${detail
              .replace(/\d+(?:\.\d+)?px/g, "<width>")
              .replace(/\d+ lines/g, "<lines>")}`;
            if (!failureSampleKeys.has(sampleKey) && kindSummary.samples.length < 12) {
              failureSampleKeys.add(sampleKey);
              const sample = { detail, gate, kind, width };
              kindSummary.samples.push(sample);
              routeFailures.push(sample);
            }
          };
          const describe = (element) => {
            const text = (element.innerText || element.value || "").replace(/\s+/g, " ").trim();
            const identity = `${element.tagName.toLowerCase()}${
              element.id ? `#${element.id}` : ""
            }${element.classList.length ? `.${[...element.classList].join(".")}` : ""}`;
            return text ? `${identity} (${text.slice(0, 90)})` : identity;
          };
          const isVisible = (element) => {
            const style = frameWindow.getComputedStyle(element);
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
          const requiresSingleLineLabel = (action) => {
            if (
              action.matches(
                "button, [role='button'], input[type='button'], input[type='submit'], input[type='reset']",
              )
            ) {
              return true;
            }
            if (!action.matches("a[href]")) return false;

            const style = frameWindow.getComputedStyle(action);
            if (style.writingMode !== "horizontal-tb") return false;

            const hasControlClass = [...action.classList].some((className) =>
              /(?:^|-)(?:button|btn|cta|action|booking|submit)(?:-|$)/i.test(className),
            );
            const isCompositeCardLink = Boolean(
              action.querySelector("h1, h2, h3, h4, p, img, picture, figure"),
            );
            if (isCompositeCardLink && !hasControlClass) return false;
            return Boolean(
              action.matches(".project-back-link, .next-article") ||
                action.closest(
                  "header nav, #site-nav-drawer, .site-footer, [data-component='footer'], [role='navigation']",
                ) ||
                hasControlClass,
            );
          };
          const renderedTextLineCount = (action) => {
            if (action.matches("input, select, textarea")) return 1;

            const textRects = [];
            const walker = frameDocument.createTreeWalker(
              action,
              frameWindow.NodeFilter.SHOW_TEXT,
              {
                acceptNode(node) {
                  if (!node.textContent?.trim()) {
                    return frameWindow.NodeFilter.FILTER_REJECT;
                  }
                  const parent = node.parentElement;
                  if (!parent || !isVisible(parent)) {
                    return frameWindow.NodeFilter.FILTER_REJECT;
                  }
                  return frameWindow.NodeFilter.FILTER_ACCEPT;
                },
              },
            );
            while (walker.nextNode()) {
              const range = frameDocument.createRange();
              range.selectNodeContents(walker.currentNode);
              textRects.push(
                ...[...range.getClientRects()].filter(
                  (rect) => rect.width > 1 && rect.height > 1,
                ),
              );
            }

            const lines = [];
            for (const rect of textRects.sort((first, second) => first.top - second.top)) {
              const matchingLine = lines.find(
                (line) =>
                  Math.min(line.bottom, rect.bottom) - Math.max(line.top, rect.top) > 1,
              );
              if (matchingLine) {
                matchingLine.top = Math.min(matchingLine.top, rect.top);
                matchingLine.bottom = Math.max(matchingLine.bottom, rect.bottom);
              } else {
                lines.push({ bottom: rect.bottom, top: rect.top });
              }
            }
            return lines.length;
          };
          const checkActionLabels = (width, state) => {
            const actions = [...frameDocument.querySelectorAll(actionSelector)]
              .filter(isVisible)
              .filter(requiresSingleLineLabel)
              .filter((action) => !action.matches(".nav-logo, .nav-item:has(.nav-logo)"));
            actionChecks += actions.length;
            for (const action of actions) {
              const text = (action.innerText || action.value || "").replace(/\s+/g, " ").trim();
              if (!text) continue;
              const renderedLines = renderedTextLineCount(action);
              maximumRenderedLines = Math.max(maximumRenderedLines, renderedLines);
              if (renderedLines > 1) {
                recordFailure(
                  width,
                  49,
                  "wrapped-affordance",
                  `${state}: ${describe(action)} renders on ${renderedLines} lines`,
                );
              }
            }
          };

          for (let width = minimumWidth; width <= maximumWidth; width += 1) {
            frame.style.width = `${width}px`;
            void frame.getBoundingClientRect().width;

            const actualWidth = frameWindow.innerWidth;
            if (actualWidth !== width) {
              recordFailure(
                width,
                34,
                "viewport-width",
                `iframe viewport resolved to ${actualWidth}px`,
              );
            }

            const root = frameDocument.documentElement;
            const body = frameDocument.body;
            const rootOverflowX = frameWindow.getComputedStyle(root).overflowX;
            const bodyOverflowX = frameWindow.getComputedStyle(body).overflowX;
            if (rootOverflowX !== "clip" || bodyOverflowX !== "clip") {
              recordFailure(
                width,
                34,
                "root-clipping",
                `root clipping is html=${rootOverflowX}, body=${bodyOverflowX}; both must be clip`,
              );
            }

            const clientWidth = root.clientWidth;
            const scrollWidth = Math.max(root.scrollWidth, body.scrollWidth);
            const overflow = Math.max(0, scrollWidth - clientWidth);
            maximumOverflow = Math.max(maximumOverflow, overflow);
            if (overflow > 0) {
              const contributors = [...frameDocument.querySelectorAll("body *")]
                .filter((element) => element instanceof frameWindow.HTMLElement)
                .map((element) => ({ element, rect: element.getBoundingClientRect() }))
                .filter(
                  ({ element, rect }) =>
                    frameWindow.getComputedStyle(element).display !== "none" &&
                    rect.width > 1 &&
                    rect.height > 1 &&
                    (rect.left < 0 || rect.right > clientWidth),
                )
                .sort(
                  (first, second) =>
                    Math.max(-second.rect.left, second.rect.right - clientWidth) -
                    Math.max(-first.rect.left, first.rect.right - clientWidth),
                )
                .slice(0, 5)
                .map(
                  ({ element, rect }) =>
                    `${describe(element)} [left=${rect.left.toFixed(1)}px, right=${rect.right.toFixed(1)}px]`,
                );
              recordFailure(
                width,
                34,
                "document-overflow",
                `document scrollWidth ${scrollWidth}px exceeds clientWidth ${clientWidth}px; contributors=${contributors.join(" | ") || "none located"}`,
              );
            }

            const unwantedScrollers = [...frameDocument.querySelectorAll("body *")]
              .filter((element) => element instanceof frameWindow.HTMLElement)
              .filter((element) => {
                const style = frameWindow.getComputedStyle(element);
                return (
                  ["auto", "scroll"].includes(style.overflowX) &&
                  element.scrollWidth > element.clientWidth
                );
              });
            for (const element of unwantedScrollers) {
              const style = frameWindow.getComputedStyle(element);
              recordFailure(
                width,
                34,
                "nested-scroller",
                `horizontal scroll container: ${describe(element)}; overflow-x=${style.overflowX}, scrollWidth=${element.scrollWidth}px, clientWidth=${element.clientWidth}px`,
              );
            }

            checkActionLabels(width, "closed-navigation");

            if (width <= 768) {
              const drawer = frameDocument.getElementById("site-nav-drawer");
              if (drawer) {
                const wasOpen = body.classList.contains("is-nav-open");
                const hadInert = drawer.hasAttribute("inert");
                const previousAriaHidden = drawer.getAttribute("aria-hidden");
                body.classList.add("is-nav-open");
                drawer.removeAttribute("inert");
                drawer.setAttribute("aria-hidden", "false");
                void drawer.getBoundingClientRect().width;
                openDrawerWidthChecks += 1;

                const openRootOverflowX = frameWindow.getComputedStyle(root).overflowX;
                const openBodyOverflowX = frameWindow.getComputedStyle(body).overflowX;
                if (openRootOverflowX !== "clip" || openBodyOverflowX !== "clip") {
                  recordFailure(
                    width,
                    34,
                    "open-root-clipping",
                    `open navigation root clipping is html=${openRootOverflowX}, body=${openBodyOverflowX}; both must be clip`,
                  );
                }
                const openScrollWidth = Math.max(root.scrollWidth, body.scrollWidth);
                const openOverflow = Math.max(0, openScrollWidth - root.clientWidth);
                maximumOverflow = Math.max(maximumOverflow, openOverflow);
                if (openOverflow > 0) {
                  recordFailure(
                    width,
                    34,
                    "open-document-overflow",
                    `open navigation scrollWidth ${openScrollWidth}px exceeds clientWidth ${root.clientWidth}px`,
                  );
                }
                checkActionLabels(width, "open-navigation");

                if (!wasOpen) body.classList.remove("is-nav-open");
                if (hadInert) drawer.setAttribute("inert", "");
                else drawer.removeAttribute("inert");
                if (previousAriaHidden === null) drawer.removeAttribute("aria-hidden");
                else drawer.setAttribute("aria-hidden", previousAriaHidden);
              }
            }
          }

          return {
            actionChecks,
            failureCount,
            failureCounts,
            failureKinds: Object.values(failureKindSummaries),
            failureWidthRanges,
            failures: routeFailures,
            maximumOverflow,
            maximumRenderedLines,
            openDrawerWidthChecks,
            widthsChecked: maximumWidth - minimumWidth + 1,
          };
        },
        { minimumWidth, maximumWidth },
      );

      expect(routeProof.widthsChecked, `Incomplete continuous-width sweep for ${route}`).toBe(
        expectedWidths,
      );
      proof.routeWidthPairs += routeProof.widthsChecked;
      proof.routes.push({ route, status, ...routeProof, failures: undefined });
      for (const gate of [34, 49]) {
        if (!routeProof.failureCounts[gate]) continue;
        const range = routeProof.failureWidthRanges[gate];
        failures.push({
          count: routeProof.failureCounts[gate],
          firstWidth: range.first,
          gate,
          lastWidth: range.last,
          route,
          kinds: routeProof.failureKinds.filter((kind) => kind.gate === gate),
          samples: routeProof.failures.filter((failure) => failure.gate === gate),
        });
      }
    }

    await testInfo.attach("hallmark-responsive-continuum", {
      body: Buffer.from(JSON.stringify({ ...proof, failures }, null, 2)),
      contentType: "application/json",
    });
    expect(
      failures,
      `Hallmark Gates 34 and 49 must pass ${proof.routeWidthPairs} route-width pairs`,
    ).toEqual([]);
  });
});

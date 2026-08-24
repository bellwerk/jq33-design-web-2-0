import { expect } from "@playwright/test";

const cloudflareAnalyticsRequest = (request, url, baseOrigin) => {
  const method = request.method().toUpperCase();
  const resourceType = request.resourceType();
  const isBeaconScript =
    url.hostname === "static.cloudflareinsights.com" &&
    /^\/beacon\.min\.js(?:\/|$)/.test(url.pathname) &&
    method === "GET" &&
    resourceType === "script";
  const isRumBeacon =
    (url.hostname === "cloudflareinsights.com" || url.origin === baseOrigin) &&
    url.pathname === "/cdn-cgi/rum" &&
    method === "POST" &&
    ["fetch", "xhr", "other"].includes(resourceType);
  return isBeaconScript || isRumBeacon;
};

const prohibitedBackendRequest = (url) => {
  const backendHostPattern =
    /(?:^|[.-])(?:admin|crm|supabase|hubspot|salesforce|pipedrive|zoho|airtable|intercom|segment)(?:[.-]|$)/i;
  const backendPathPattern =
    /\/(?:admin|crm|rest\/v1|auth\/v1|realtime\/v1|functions\/v1)(?:\/|$)/i;
  return backendHostPattern.test(url.hostname) || backendPathPattern.test(url.pathname);
};

export async function settlePage(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForFunction(
    () =>
      !document.querySelector('link[rel="stylesheet"][data-jq33-deferred-css]') ||
      document.documentElement.dataset.jq33Css === "ready",
    undefined,
    { timeout: 10_000 },
  );
  const brokenImages = await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    const watchedImages = [...document.images].filter(
      (image) =>
        image.loading !== "lazy" ||
        image.getBoundingClientRect().top < window.innerHeight * 2,
    );
    await Promise.all(
      watchedImages.map((image) =>
        image.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              let settled = false;
              const finish = () => {
                if (settled) return;
                settled = true;
                window.clearTimeout(timeout);
                image.removeEventListener("load", finish);
                image.removeEventListener("error", finish);
                resolve();
              };
              const timeout = window.setTimeout(finish, 8_000);
              image.addEventListener("load", finish);
              image.addEventListener("error", finish);
              if (image.complete) finish();
            }),
      ),
    );
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    return watchedImages
      .filter((image) => image.complete && image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src);
  });
  expect(brokenImages, "Every rendered image must decode successfully").toEqual([]);
}

export async function gotoSettledWithStatus(page, route, expectedStatus) {
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  expect(response, `No navigation response for ${route}`).not.toBeNull();
  expect(response.status(), `Unexpected response for ${route}`).toBe(expectedStatus);
  await settlePage(page);
}

export async function gotoSettled(page, route) {
  await gotoSettledWithStatus(page, route, 200);
}

export async function gotoNotFoundSettled(page, route) {
  await gotoSettledWithStatus(page, route, 404);
}

export async function installPreActionRuntimeAudit(page, baseURL) {
  const baseOrigin = new URL(baseURL).origin;
  const audit = {
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
    unexpectedResponses: [],
    webSockets: [],
    unexpectedThirdParty: [],
    prohibitedBackends: [],
    remoteMedia: [],
    allowedCloudflareAnalytics: [],
  };
  const deliberatelyBlocked = new Set();

  page.on("console", (message) => {
    if (message.type() === "error") {
      audit.consoleErrors.push({
        text: message.text(),
        location: message.location(),
      });
    }
  });
  page.on("pageerror", (error) => {
    audit.pageErrors.push(error.message);
  });
  page.on("requestfailed", (request) => {
    if (deliberatelyBlocked.has(request.url())) return;
    audit.requestFailures.push(
      `${request.method()} ${request.url()} (${request.failure()?.errorText || "failed"})`,
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 200 && response.status() < 300) return;
    const request = response.request();
    audit.unexpectedResponses.push({
      method: request.method(),
      url: response.url(),
      status: response.status(),
      resourceType: request.resourceType(),
      navigation: request.isNavigationRequest(),
    });
  });
  page.on("websocket", (socket) => {
    audit.webSockets.push(socket.url());
  });

  await page.route("**/*", async (intercepted) => {
    const request = intercepted.request();
    let url;
    try {
      url = new URL(request.url());
    } catch {
      await intercepted.continue();
      return;
    }

    if (!["http:", "https:"].includes(url.protocol)) {
      await intercepted.continue();
      return;
    }

    const entry = `${request.method()} ${url.href} [${request.resourceType()}]`;
    if (prohibitedBackendRequest(url)) audit.prohibitedBackends.push(entry);
    if (["font", "image"].includes(request.resourceType())) {
      if (url.origin !== baseOrigin) audit.remoteMedia.push(entry);
    }

    if (cloudflareAnalyticsRequest(request, url, baseOrigin)) {
      audit.allowedCloudflareAnalytics.push(entry);
      if (request.resourceType() === "script") {
        await intercepted.fulfill({
          status: 200,
          contentType: "text/javascript; charset=utf-8",
          body: "",
        });
      } else {
        await intercepted.fulfill({ status: 204, body: "" });
      }
      return;
    }

    if (url.origin === baseOrigin) {
      await intercepted.continue();
      return;
    }

    audit.unexpectedThirdParty.push(entry);
    deliberatelyBlocked.add(request.url());
    await intercepted.abort("blockedbyclient");
  });

  return audit;
}

export function expectPreActionRuntimeAudit(
  audit,
  { expectedNotFoundDocumentUrl = "" } = {},
) {
  const expectedNotFoundConsoleErrors = expectedNotFoundDocumentUrl
    ? audit.consoleErrors.filter(
        (entry) =>
          [
            "Failed to load resource: the server responded with a status of 404 (Not Found)",
            "Failed to load resource: the server responded with a status of 404 ()",
          ].includes(entry.text) &&
          entry.location?.url === expectedNotFoundDocumentUrl,
      )
    : [];
  const unexpectedConsoleErrors = audit.consoleErrors.filter(
    (entry) => !expectedNotFoundConsoleErrors.includes(entry),
  );
  const expectedNotFoundResponses = expectedNotFoundDocumentUrl
    ? audit.unexpectedResponses.filter(
        (entry) =>
          entry.status === 404 &&
          entry.url === expectedNotFoundDocumentUrl &&
          entry.method === "GET" &&
          entry.resourceType === "document" &&
          entry.navigation === true,
      )
    : [];
  const unexpectedResponses = audit.unexpectedResponses.filter(
    (entry) => !expectedNotFoundResponses.includes(entry),
  );
  if (expectedNotFoundDocumentUrl) {
    expect(
      expectedNotFoundConsoleErrors.length,
      "Chromium may report the expected 404 main-document status once; no resource 404 is allowlisted",
    ).toBeLessThanOrEqual(1);
    expect(
      expectedNotFoundResponses,
      "The branded not-found probe must have exactly one 404 main-document response",
    ).toHaveLength(1);
  }
  expect(
    unexpectedConsoleErrors,
    "The page must not emit console errors before user action",
  ).toEqual([]);
  expect(audit.pageErrors, "The page must not throw uncaught runtime errors").toEqual([]);
  expect(
    audit.requestFailures,
    "Local and approved runtime requests must not fail",
  ).toEqual([]);
  expect(
    unexpectedResponses,
    "Every response must be 2xx except the exact branded 404 main-document probe",
  ).toEqual([]);
  expect(audit.webSockets, "The static public site must not open WebSockets").toEqual([]);
  expect(
    audit.prohibitedBackends,
    "The static public site must not contact Supabase, admin, CRM, or other backend services",
  ).toEqual([]);
  expect(
    audit.remoteMedia,
    "All production fonts and images must be served from the site artifact",
  ).toEqual([]);
  expect(
    audit.unexpectedThirdParty,
    "Only the narrowly allowlisted Cloudflare Web Analytics requests may occur before user action",
  ).toEqual([]);
}

export async function horizontalOverflow(page) {
  return page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: Math.max(
      document.documentElement.scrollWidth,
      document.body?.scrollWidth || 0,
    ),
  }));
}

export async function scrollAndValidateAllImages(page) {
  return page.evaluate(async () => {
    const afterPaint = () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    const step = Math.max(240, Math.floor(innerHeight * 0.75));
    let passes = 0;
    const scrollingElement = document.scrollingElement || document.documentElement;
    const scrollRoots = [
      scrollingElement,
      ...[...document.querySelectorAll("*")].filter((element) => {
        if (!(element instanceof HTMLElement) || element === scrollingElement) return false;
        const overflowY = getComputedStyle(element).overflowY;
        return (
          ["auto", "scroll"].includes(overflowY) &&
          element.scrollHeight > element.clientHeight + 2
        );
      }),
    ];
    for (const scrollRoot of scrollRoots) {
      let target = 0;
      while (target < scrollRoot.scrollHeight && passes < 500) {
        scrollRoot.scrollTop = target;
        await afterPaint();
        target += step;
        passes += 1;
      }
      scrollRoot.scrollTop = scrollRoot.scrollHeight;
      await afterPaint();
    }

    const images = [...document.images];
    await Promise.all(
      images.map(
        (image) =>
          new Promise((resolve) => {
            if (image.complete) {
              resolve();
              return;
            }
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              clearTimeout(timeout);
              image.removeEventListener("load", finish);
              image.removeEventListener("error", finish);
              resolve();
            };
            const timeout = setTimeout(finish, 5_000);
            image.addEventListener("load", finish);
            image.addEventListener("error", finish);
            if (image.complete) finish();
          }),
      ),
    );

    const results = await Promise.all(
      images.map(async (image) => {
        let decodeError = "";
        if (image.complete && image.naturalWidth > 0 && typeof image.decode === "function") {
          try {
            await image.decode();
          } catch (error) {
            decodeError = error instanceof Error ? error.message : String(error);
          }
        }
        return {
          alt: image.alt,
          complete: image.complete,
          currentSrc: image.currentSrc || image.src,
          decodeError,
          loading: image.loading,
          naturalHeight: image.naturalHeight,
          naturalWidth: image.naturalWidth,
        };
      }),
    );
    for (const scrollRoot of scrollRoots) scrollRoot.scrollTop = 0;
    await afterPaint();
    return {
      images: results,
      failures: results.filter(
        (image) =>
          !image.complete ||
          image.naturalWidth <= 0 ||
          image.naturalHeight <= 0 ||
          Boolean(image.decodeError),
      ),
      scrollPasses: passes,
    };
  });
}

export async function nonActionLayoutCollisions(page) {
  return page.evaluate(() => {
    const parentSelector = [
      "main",
      "section",
      "article",
      "form",
      "footer",
      "ul",
      "ol",
      "[class*='grid']",
      "[class*='list']",
      "[class*='row']",
      "[class*='columns']",
      "[class*='cards']",
      "[class*='shell']",
    ].join(",");
    const actionSelector = [
      "a[href]",
      "button",
      "input:not([type='hidden'])",
      "select",
      "textarea",
      "summary",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    const describe = (element) => {
      const text = (element.innerText || "").replace(/\s+/g, " ").trim().slice(0, 70);
      const identity = `${element.tagName.toLowerCase()}${
        element.id ? `#${element.id}` : ""
      }${element.classList.length ? `.${[...element.classList].join(".")}` : ""}`;
      return text ? `${identity} (${text})` : identity;
    };
    const eligible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      if (element.matches("script, style, template, [hidden], [aria-hidden='true']")) return false;
      if (element.closest("[inert], [aria-hidden='true']")) return false;
      if (element.matches(actionSelector) || element.querySelector(actionSelector)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        !["none", "contents"].includes(style.display) &&
        !["hidden", "collapse"].includes(style.visibility) &&
        Number(style.opacity) > 0 &&
        !["absolute", "fixed", "sticky"].includes(style.position) &&
        style.transform === "none" &&
        rect.width > 2 &&
        rect.height > 2
      );
    };

    const collisions = [];
    for (const parent of document.querySelectorAll(parentSelector)) {
      if (!(parent instanceof HTMLElement)) continue;
      const parentStyle = getComputedStyle(parent);
      if (!["block", "flex", "inline-flex"].includes(parentStyle.display)) continue;
      const children = [...parent.children].filter(eligible);
      for (let firstIndex = 0; firstIndex < children.length; firstIndex += 1) {
        for (
          let secondIndex = firstIndex + 1;
          secondIndex < children.length;
          secondIndex += 1
        ) {
          const first = children[firstIndex];
          const second = children[secondIndex];
          const firstRect = first.getBoundingClientRect();
          const secondRect = second.getBoundingClientRect();
          const overlapWidth = Math.min(firstRect.right, secondRect.right) -
            Math.max(firstRect.left, secondRect.left);
          const overlapHeight = Math.min(firstRect.bottom, secondRect.bottom) -
            Math.max(firstRect.top, secondRect.top);
          if (overlapWidth <= 3 || overlapHeight <= 3) continue;
          const overlapArea = overlapWidth * overlapHeight;
          const smallerArea = Math.min(
            firstRect.width * firstRect.height,
            secondRect.width * secondRect.height,
          );
          if (smallerArea <= 0 || overlapArea / smallerArea < 0.03) continue;
          collisions.push({
            parent: describe(parent),
            first: describe(first),
            second: describe(second),
            overlapRatio: Number((overlapArea / smallerArea).toFixed(4)),
          });
        }
      }
    }
    return collisions;
  });
}

import { expect, test } from "@playwright/test";
import {
  expectPreActionRuntimeAudit,
  gotoNotFoundSettled,
  gotoSettled,
  installPreActionRuntimeAudit,
} from "./helpers/browser.mjs";
import { notFoundRoute, publicRoutes } from "./helpers/site.mjs";

const documents = [
  ...publicRoutes.map((route) => ({ route, status: 200 })),
  { route: notFoundRoute, status: 404 },
];

for (const documentCase of documents) {
  test(`${documentCase.route} has a clean pre-action runtime and network boundary`, async ({
    page,
    baseURL,
  }, testInfo) => {
    expect(baseURL, "The network audit requires an explicit Playwright base URL").toBeTruthy();
    const audit = await installPreActionRuntimeAudit(page, baseURL);

    if (documentCase.status === 404) {
      await gotoNotFoundSettled(page, documentCase.route);
    } else {
      await gotoSettled(page, documentCase.route);
    }

    await page.waitForLoadState("load");
    await page.waitForTimeout(150);
    await testInfo.attach("pre-action-runtime-audit", {
      body: Buffer.from(
        JSON.stringify(
          {
            scope:
              "Before any user action: console/runtime errors, failed requests, backend traffic, remote media, and third-party traffic.",
            cloudflareAnalyticsAllowlist:
              "GET static.cloudflareinsights.com/beacon.min.js[/version] as script; POST /cdn-cgi/rum as fetch/xhr/other only.",
            expectedNavigationStatusConsoleException:
              documentCase.status === 404
                ? "Chromium's single main-document 404 status line at this exact URL is not a script/runtime error; resource 404s remain failures."
                : null,
            ...audit,
          },
          null,
          2,
        ),
      ),
      contentType: "application/json",
    });

    expectPreActionRuntimeAudit(audit, {
      expectedNotFoundDocumentUrl:
        documentCase.status === 404
          ? new URL(documentCase.route, baseURL).href
          : "",
    });
  });
}

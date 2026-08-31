import { expect, test } from "@playwright/test";
import {
  expectPreActionRuntimeAudit,
  gotoNotFoundSettled,
  gotoSettled,
  installPreActionRuntimeAudit,
  nonActionLayoutCollisions,
  scrollAndValidateAllImages,
} from "./helpers/browser.mjs";
import { notFoundRoute, publicRoutes } from "./helpers/site.mjs";

const documents = [
  ...publicRoutes.map((route) => ({ route, status: 200 })),
  { route: notFoundRoute, status: 404 },
];
const mediaViewports = [
  { width: 375, height: 800 },
  { width: 1280, height: 800 },
];

for (const documentCase of documents) {
  for (const viewport of mediaViewports) {
    test(`${documentCase.route} loads every scrolled image and keeps normal-flow regions separate at ${viewport.width}px`, async ({
      page,
      baseURL,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      const audit = await installPreActionRuntimeAudit(page, baseURL);
      if (documentCase.status === 404) {
        await gotoNotFoundSettled(page, documentCase.route);
      } else {
        await gotoSettled(page, documentCase.route);
      }

      const imageProof = await scrollAndValidateAllImages(page);
      expect(
        imageProof.failures,
        "Every eager and lazy image must finish loading and decode after a full scroll",
      ).toEqual([]);
      const collisions = await nonActionLayoutCollisions(page);
      expect(
        collisions,
        "Normal-flow, non-action sibling regions must not materially collide",
      ).toEqual([]);

      expectPreActionRuntimeAudit(audit, {
        expectedNotFoundDocumentUrl:
          documentCase.status === 404
            ? new URL(documentCase.route, baseURL).href
            : "",
      });
      await testInfo.attach("scrolled-media-layout-proof", {
        body: Buffer.from(
          JSON.stringify(
            {
              route: documentCase.route,
              viewport,
              imageProof,
              collisions,
              audit,
            },
            null,
            2,
          ),
        ),
        contentType: "application/json",
      });
    });
  }
}

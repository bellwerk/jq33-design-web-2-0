import crypto from "node:crypto";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import {
  gotoNotFoundSettled,
  gotoSettled,
} from "./helpers/browser.mjs";
import {
  notFoundRoute,
  projectSlugs,
  publicRoutes,
} from "./helpers/site.mjs";

const publicDocumentCases = [
  ...publicRoutes.map((route) => ({ route, status: 200 })),
  { route: notFoundRoute, status: 404 },
];

const controlSelector = [
  "body",
  "a[href]",
  "button",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "label",
  "summary",
  "nav",
].join(",");

const actionSelector = [
  "[data-calendly-cta]",
  ".btn",
  ".cta-button",
  ".hero-action",
  ".final-cta__link",
  ".drawer-cta",
  "button[type='submit']",
].join(",");

async function gotoPublicDocument(page, documentCase) {
  if (documentCase.status === 404) {
    await gotoNotFoundSettled(page, documentCase.route);
    return;
  }
  await gotoSettled(page, documentCase.route);
}

function fontIncludes(actual, expected) {
  return String(actual).toLowerCase().includes(expected.toLowerCase());
}

function colorIsTransparent(value) {
  const normalized = String(value).replace(/\s+/g, "").toLowerCase();
  return (
    normalized === "transparent" ||
    normalized === "rgba(0,0,0,0)" ||
    normalized.endsWith(",0)")
  );
}

async function interactionStyle(locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
      color: style.color,
      filter: style.filter,
      opacity: style.opacity,
      textDecorationLine: style.textDecorationLine,
      transform: style.transform,
    };
  });
}

async function expectActiveSignal(page, locator, label) {
  await locator.scrollIntoViewIfNeeded();
  await locator.hover();
  await page.waitForTimeout(320);
  const hover = await interactionStyle(locator);
  const box = await locator.boundingBox();
  expect(box, `${label} must have a rendered hit target`).not.toBeNull();

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(320);
  expect(
    await locator.evaluate((element) => element.matches(":active")),
    `${label} must enter the native :active state during pointer activation`,
  ).toBe(true);
  const active = await interactionStyle(locator);
  await page.mouse.move(1, 1);
  await page.mouse.up();

  const changedProperties = Object.keys(active).filter(
    (property) => active[property] !== hover[property],
  );
  expect(
    changedProperties,
    `${label} must expose a visible :active signal distinct from hover`,
  ).not.toEqual([]);
}

for (const documentCase of publicDocumentCases) {
  test(`${documentCase.route} has a valid main-targeting skip link visible on focus`, async ({
    page,
  }) => {
    await gotoPublicDocument(page, documentCase);

    const skipLink = page.locator("body > a.skip-link").first();
    expect(
      await page.locator("body > a.skip-link").count(),
      "Each document must contain exactly one direct-child skip link",
    ).toBe(1);
    const contract = await skipLink.evaluate((element) => {
      const href = element.getAttribute("href") || "";
      let target = null;
      if (/^#[A-Za-z][\w:.-]*$/.test(href)) {
        target = document.getElementById(href.slice(1));
      }
      return {
        bodyFirstElement: document.body.firstElementChild === element,
        href,
        mainCount: document.querySelectorAll("main, [role='main']").length,
        targetCount: target ? document.querySelectorAll(href).length : 0,
        targetIsMain:
          target instanceof HTMLElement &&
          (target.matches("main") || target.getAttribute("role") === "main"),
      };
    });

    expect(contract.bodyFirstElement, "The skip link must be the first body element").toBe(true);
    expect(contract.href).toMatch(/^#[A-Za-z][\w:.-]*$/);
    expect(contract.mainCount, "Each document must expose one main landmark").toBe(1);
    expect(contract.targetCount, "The skip-link fragment must resolve exactly once").toBe(1);
    expect(contract.targetIsMain, "The skip link must target the main landmark").toBe(true);

    await page.keyboard.press("Tab");
    await expect(skipLink).toBeFocused();
    await expect
      .poll(
        () =>
          skipLink.evaluate((element) => element.getBoundingClientRect().bottom),
        {
          message: "The focused skip link must finish moving into the viewport",
          timeout: 1_000,
        },
      )
      .toBeGreaterThan(0);
    const focusedGeometry = await skipLink.evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        display: style.display,
        height: rect.height,
        left: rect.left,
        opacity: Number(style.opacity),
        right: rect.right,
        top: rect.top,
        visibility: style.visibility,
        width: rect.width,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      };
    });
    expect(focusedGeometry.display).not.toBe("none");
    expect(focusedGeometry.visibility).not.toBe("hidden");
    expect(focusedGeometry.opacity).toBeGreaterThan(0);
    expect(focusedGeometry.width).toBeGreaterThan(1);
    expect(focusedGeometry.height).toBeGreaterThan(1);
    expect(focusedGeometry.right).toBeGreaterThan(0);
    expect(focusedGeometry.left).toBeLessThan(focusedGeometry.viewportWidth);
    expect(focusedGeometry.bottom).toBeGreaterThan(0);
    expect(focusedGeometry.top).toBeLessThan(focusedGeometry.viewportHeight);

    await page.keyboard.press("Enter");
    await expect.poll(() => new URL(page.url()).hash).toBe(contract.href);
    await expect
      .poll(() =>
        skipLink.evaluate((element) => {
          const target = document.querySelector(element.getAttribute("href"));
          return document.activeElement === target;
        }),
      )
      .toBe(true);

    await page.keyboard.press("Tab");
    const nextFocus = await skipLink.evaluate(() => {
      const active = document.activeElement;
      return {
        insideRepeatedHeader: active instanceof HTMLElement
          ? Boolean(active.closest("header.header-nav"))
          : false,
        markup: active instanceof HTMLElement ? active.outerHTML.slice(0, 180) : "",
      };
    });
    expect(
      nextFocus.insideRepeatedHeader,
      `The next Tab after skip activation must bypass the repeated header, not ${nextFocus.markup}`,
    ).toBe(false);
  });

  test(`${documentCase.route} uses Permanent Marker headings and Lato UI`, async ({
    page,
  }) => {
    await gotoPublicDocument(page, documentCase);

    const typography = await page.evaluate((selector) => {
      const rendered = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0 &&
          !element.closest("[inert], [aria-hidden='true']")
        );
      };
      const describe = (element) =>
        `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${
          element.classList.length ? `.${[...element.classList].join(".")}` : ""
        }`;
      const fontRows = (elements) =>
        elements.map((element) => ({
          element: describe(element),
          fontFamily: getComputedStyle(element).fontFamily,
        }));

      const headings = [
        ...document.querySelectorAll("h1, h2, h3, h4, h5, h6, [role='heading']"),
      ];
      const displayMarks = [...document.querySelectorAll(".brand-mark")].filter(rendered);
      const ui = [...document.querySelectorAll(selector)].filter(rendered);
      return {
        headings: fontRows(headings),
        displayMarks: fontRows(displayMarks),
        ui: fontRows(ui),
      };
    }, controlSelector);

    expect(typography.headings.length, "Every page must expose at least one heading").toBeGreaterThan(
      0,
    );
    expect(
      typography.headings.filter(
        (entry) => !fontIncludes(entry.fontFamily, "Permanent Marker"),
      ),
      "Every semantic heading must compute to Permanent Marker",
    ).toEqual([]);
    expect(
      typography.displayMarks.filter(
        (entry) => !fontIncludes(entry.fontFamily, "Permanent Marker"),
      ),
      "Every visible decorative JQ33 display mark must compute to Permanent Marker",
    ).toEqual([]);
    expect(
      typography.ui.filter((entry) => !fontIncludes(entry.fontFamily, "Lato")),
      "Body and interactive UI typography must compute to Lato",
    ).toEqual([]);
  });

  test(`${documentCase.route} keeps decorative grain out of the accessibility tree`, async ({
    page,
  }) => {
    await gotoPublicDocument(page, documentCase);

    const exposedGrain = await page.evaluate(() =>
      [...document.querySelectorAll(".grain")]
        .filter((element) => {
          const focusable = element.querySelector(
            "a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex='-1'])",
          );
          return (
            element.getAttribute("aria-hidden") !== "true" ||
            Boolean(focusable) ||
            element.textContent.trim().length > 0
          );
        })
        .map((element) => element.outerHTML.slice(0, 220)),
    );
    expect(exposedGrain).toEqual([]);
  });

  test(`${documentCase.route} centers navigation and keeps CTA labels on one line`, async ({
    page,
  }) => {
    for (const viewport of [
      { width: 375, height: 800 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      await gotoPublicDocument(page, documentCase);

      const navigationAndActions = await page.evaluate((selector) => {
        const rendered = (element) => {
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
        const header = document.querySelector("header.header-nav");
        const visibleActions = [...document.querySelectorAll(selector)].filter(rendered);
        const wrapped = visibleActions.flatMap((element) => {
          const text = (element.innerText || element.value || "").replace(/\s+/g, " ").trim();
          if (!text) return [];
          const range = document.createRange();
          range.selectNodeContents(element);
          const lineTops = new Set(
            [...range.getClientRects()]
              .filter((rect) => rect.width > 1 && rect.height > 1)
              .map((rect) => Math.round(rect.top)),
          );
          return lineTops.size > 1
            ? [
                {
                  element: element.outerHTML.slice(0, 180),
                  lines: lineTops.size,
                  text,
                  whiteSpace: getComputedStyle(element).whiteSpace,
                },
              ]
            : [];
        });
        return {
          headerAlignItems: header ? getComputedStyle(header).alignItems : "",
          headerRendered: header ? rendered(header) : false,
          wrapped,
        };
      }, actionSelector);

      expect(navigationAndActions.headerRendered, "The global header must be rendered").toBe(true);
      expect(
        navigationAndActions.headerAlignItems,
        `Header items must be vertically centred at ${viewport.width}px`,
      ).toBe("center");
      expect(
        navigationAndActions.wrapped,
        `CTA labels must remain on one line at ${viewport.width}px`,
      ).toEqual([]);
    }
  });
}

test("homepage mobile navigation leaves the photographic hero unobstructed", async ({
  page,
}) => {
  for (const viewport of [
    { width: 320, height: 800 },
    { width: 375, height: 800 },
    { width: 414, height: 800 },
    { width: 768, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await gotoSettled(page, "/");

    const layout = await page.evaluate(() => {
      const rendered = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) > 0 &&
          rect.width > 1 &&
          rect.height > 1
        );
      };
      const describe = (element) =>
        `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${
          element.classList.length ? `.${[...element.classList].join(".")}` : ""
        }`;
      const navGroup = document.querySelector("header.header-nav .nav-group");
      const toggle = document.querySelector("header.header-nav .nav-toggle");
      const headerControls = [
        document.querySelector("header.header-nav .nav-item"),
        toggle,
      ].filter(rendered);
      const heroContent = [
        document.querySelector("#home .header-tagline"),
        document.querySelector("#home .header-subheadline"),
        document.querySelector("#home .hero-actions"),
        document.querySelector("#home .info-pillar.pillar-left"),
      ].filter(rendered);
      const overlaps = [];
      for (const control of headerControls) {
        const controlRect = control.getBoundingClientRect();
        for (const content of heroContent) {
          const contentRect = content.getBoundingClientRect();
          const width =
            Math.min(controlRect.right, contentRect.right) -
            Math.max(controlRect.left, contentRect.left);
          const height =
            Math.min(controlRect.bottom, contentRect.bottom) -
            Math.max(controlRect.top, contentRect.top);
          if (width > 2 && height > 2) {
            overlaps.push(`${describe(control)} <> ${describe(content)}`);
          }
        }
      }
      return {
        heroContentCount: heroContent.length,
        navGroupDisplay: navGroup ? getComputedStyle(navGroup).display : "missing",
        navGroupWidth: navGroup?.getBoundingClientRect().width ?? -1,
        overlaps,
        toggleDisplay: toggle ? getComputedStyle(toggle).display : "missing",
        toggleRendered: rendered(toggle),
      };
    });

    expect(layout.navGroupDisplay, `Desktop nav must be hidden at ${viewport.width}px`).toBe(
      "none",
    );
    expect(layout.navGroupWidth, `Hidden desktop nav must reserve no width at ${viewport.width}px`).toBe(
      0,
    );
    expect(
      ["flex", "inline-flex"],
      `Mobile menu must render as a flex control at ${viewport.width}px`,
    ).toContain(layout.toggleDisplay);
    expect(layout.toggleRendered, `Mobile menu must be visible at ${viewport.width}px`).toBe(true);
    expect(layout.heroContentCount, "The required hero conversion content must remain rendered").toBe(
      4,
    );
    expect(
      layout.overlaps,
      `Header controls must not overlap hero copy or actions at ${viewport.width}px`,
    ).toEqual([]);
  }
});

test("homepage photo-backed copy uses readable 30px contrast surfaces", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoSettled(page, "/");

  const surfaces = await page.evaluate(() => {
    const parseColor = (value) => {
      const channels = String(value).match(/[\d.]+/g)?.map(Number) || [];
      return {
        rgb: channels.slice(0, 3),
        alpha: channels.length > 3 ? channels[3] : 1,
      };
    };
    const linear = (channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (rgb) =>
      0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
    const contrast = (first, second) => {
      const high = Math.max(luminance(first), luminance(second));
      const low = Math.min(luminance(first), luminance(second));
      return (high + 0.05) / (low + 0.05);
    };
    const minimumBackdropContrast = (foreground, background) => {
      const foregroundColor = parseColor(foreground);
      const backgroundColor = parseColor(background);
      const ratios = [0, 255].map((backdrop) => {
        const composited = backgroundColor.rgb.map(
          (channel) =>
            channel * backgroundColor.alpha + backdrop * (1 - backgroundColor.alpha),
        );
        return contrast(foregroundColor.rgb, composited);
      });
      return Math.min(...ratios);
    };
    const rendered = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && rect.width > 1 && rect.height > 1;
    };
    return [
      document.querySelector("#home .header-subheadline"),
      ...document.querySelectorAll("#home .info-pillar"),
    ]
      .filter((element) => element instanceof HTMLElement && rendered(element))
      .map((element) => {
        const style = getComputedStyle(element);
        return {
          borderRadius: style.borderRadius,
          contrast: minimumBackdropContrast(style.color, style.backgroundColor),
          element: element.className,
          backgroundColor: style.backgroundColor,
        };
      });
  });

  expect(surfaces.length, "Homepage contrast surfaces must be rendered").toBeGreaterThanOrEqual(3);
  expect(
    surfaces.filter((surface) => surface.borderRadius !== "30px"),
    "Homepage photo-backed copy surfaces must use the approved 30px radius",
  ).toEqual([]);
  expect(
    surfaces.filter((surface) => surface.contrast < 4.5),
    "Photo-backed body copy must maintain at least 4.5:1 over black or white image crops",
  ).toEqual([]);
});

test("homepage hero mark keeps a contrast-safe backing and restrained mobile accent footprint", async ({
  page,
}) => {
  for (const viewport of [
    { width: 320, height: 800 },
    { width: 375, height: 800 },
    { width: 414, height: 800 },
    { width: 481, height: 800 },
    { width: 769, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await gotoSettled(page, "/");

    const mark = page.locator("#home .brand-mark__text");
    await expect(mark).toBeVisible();
    const markContract = await mark.evaluate((element) => {
      const style = getComputedStyle(element);
      const channels = (value) => String(value).match(/[\d.]+/g)?.map(Number) || [];
      const foreground = channels(style.color).slice(0, 3);
      const backgroundChannels = channels(style.backgroundColor);
      const background = backgroundChannels.slice(0, 3);
      const alpha = backgroundChannels.length > 3 ? backgroundChannels[3] : 1;
      const linear = (channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (rgb) =>
        0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
      const contrast = (first, second) => {
        const high = Math.max(luminance(first), luminance(second));
        const low = Math.min(luminance(first), luminance(second));
        return (high + 0.05) / (low + 0.05);
      };
      const minimumContrast = Math.min(
        ...[0, 255].map((backdrop) =>
          contrast(
            foreground,
            background.map((channel) => channel * alpha + backdrop * (1 - alpha)),
          ),
        ),
      );
      return {
        borderRadius: style.borderRadius,
        fontSize: Number.parseFloat(style.fontSize),
        minimumContrast,
      };
    });

    expect(markContract.borderRadius).toBe("20px");
    expect(markContract.fontSize, `Hero mark is too large at ${viewport.width}px`).toBeLessThanOrEqual(
      viewport.width <= 414 ? 32 : 64,
    );
    expect(
      markContract.minimumContrast,
      `Hero mark must keep at least 3:1 contrast over any photographic crop at ${viewport.width}px`,
    ).toBeGreaterThanOrEqual(3);

    const screenshot = await page.screenshot();
    const { data, info } = await sharp(screenshot)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let accentPixels = 0;
    for (let offset = 0; offset < data.length; offset += info.channels) {
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      if (blue - red >= 24 && blue - green >= 18 && blue >= 90) accentPixels += 1;
    }
    const accentRatio = accentPixels / (info.width * info.height);
    expect(
      accentRatio,
      `Cobalt should occupy no more than 5.1% of the mobile viewport at ${viewport.width}px`,
    ).toBeLessThanOrEqual(0.051);
  }
});

test("approved visual taxonomy computes to 30px containers, 20px cards, and a square hero", async ({
  page,
}) => {
  const cases = [
    { route: "/inquiry/", selector: "#inquiry-name", radius: "30px" },
    { route: "/inquiry/", selector: ".site-footer .info-pillar", radius: "30px" },
    { route: "/commercial-interior-design-montreal/", selector: ".cta-panel", radius: "30px" },
    {
      route: "/commercial-interior-design-montreal/",
      selector: ".trust-strip span",
      radius: "30px",
    },
    {
      route: "/commercial-interior-design-montreal/",
      selector: ".case-card",
      radius: "20px",
    },
    {
      route: "/commercial-interior-design-montreal/",
      selector: ".hero-media img",
      radius: "0px",
    },
    { route: notFoundRoute, selector: ".error-panel", radius: "30px", status: 404 },
  ];

  for (const visualCase of cases) {
    if (visualCase.status === 404) await gotoNotFoundSettled(page, visualCase.route);
    else await gotoSettled(page, visualCase.route);
    const target = page.locator(visualCase.selector).first();
    await expect(target, `${visualCase.route} ${visualCase.selector} must render`).toBeVisible();
    expect(
      await target.evaluate((element) => getComputedStyle(element).borderRadius),
      `${visualCase.route} ${visualCase.selector} must use ${visualCase.radius}`,
    ).toBe(visualCase.radius);
  }
});

for (const route of ["/contact/", "/inquiry/"]) {
  test(`${route} has persistent, correctly referenced field error slots`, async ({ page }) => {
    await gotoSettled(page, route);
    const form = page.locator("form[data-lead-form]");
    const controls = form.locator(
      "input:not([type='hidden']):not([type='submit']):not([name='_gotcha']), select, textarea",
    );
    const controlCount = await controls.count();
    expect(controlCount).toBeGreaterThan(0);

    const initial = await controls.evaluateAll((elements) =>
      elements.map((control) => {
        const ids = String(control.getAttribute("aria-describedby") || "")
          .split(/\s+/)
          .filter(Boolean);
        const slots = ids.flatMap((id) => {
          const matches = [...document.querySelectorAll(`[id="${CSS.escape(id)}"]`)];
          return matches.map((slot) => {
            const style = getComputedStyle(slot);
            return {
              count: matches.length,
              dataFieldError: slot.hasAttribute("data-field-error"),
              height: slot.getBoundingClientRect().height,
              id,
              live: slot.getAttribute("aria-live"),
              minHeight: Number.parseFloat(style.minHeight) || 0,
              text: slot.textContent.trim(),
            };
          });
        });
        return {
          describedBy: ids,
          id: control.id,
          required: control.required,
          slots,
        };
      }),
    );

    expect(
      initial.filter(
        (entry) =>
          !entry.id ||
          entry.describedBy.length === 0 ||
          entry.slots.length !== entry.describedBy.length ||
          entry.slots.some(
            (slot) =>
              slot.count !== 1 ||
              !slot.dataFieldError ||
              slot.live !== "polite" ||
              Math.max(slot.height, slot.minHeight) < 12,
          ),
      ),
      "Every user-facing field needs a unique, persistent, aria-live error/helper slot",
    ).toEqual([]);

    await form.evaluate((element) => element.requestSubmit());
    await expect(form.locator("[data-form-status]")).toHaveAttribute("data-state", "error");

    const invalid = form.locator(
      "input:not([type='hidden']):not([type='submit']):not([name='_gotcha']):invalid, select:invalid, textarea:invalid",
    );
    expect(await invalid.count()).toBeGreaterThan(0);
    for (let index = 0; index < (await invalid.count()); index += 1) {
      const control = invalid.nth(index);
      await expect(control).toHaveAttribute("aria-invalid", "true");
      const errorIds = String((await control.getAttribute("aria-describedby")) || "")
        .split(/\s+/)
        .filter(Boolean);
      expect(errorIds.length).toBeGreaterThan(0);
      for (const id of errorIds) {
        await expect(page.locator(`#${id}`)).not.toHaveText("");
      }
    }

    const firstControl = controls.first();
    const firstErrorId = String(await firstControl.getAttribute("aria-describedby"))
      .split(/\s+/)
      .filter(Boolean)[0];
    await firstControl.fill("QA accessibility check");
    await expect(firstControl).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.locator(`#${firstErrorId}`)).toHaveText("");
    await expect(page.locator(`#${firstErrorId}`)).toHaveCount(1);
  });

  test(`${route} exposes distinct rest, focus, and disabled form-control states`, async ({
    page,
  }) => {
    await gotoSettled(page, route);
    const controls = page.locator(
      "form[data-lead-form] input:not([type='hidden']):not([type='submit']):not([name='_gotcha']), form[data-lead-form] select, form[data-lead-form] textarea",
    );

    for (let index = 0; index < (await controls.count()); index += 1) {
      const control = controls.nth(index);
      const label = (await control.getAttribute("id")) || `control ${index + 1}`;
      const rest = await control.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          outlineStyle: style.outlineStyle,
          outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
        };
      });
      expect(rest.outlineStyle, `${label} needs a reserved rest-state outline`).not.toBe("none");
      expect(rest.outlineWidth, `${label} needs a reserved rest-state outline`).toBeGreaterThanOrEqual(
        2,
      );

      await control.focus();
      await expect(control).toBeFocused();
      const focused = await control.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          outlineColor: style.outlineColor,
          outlineStyle: style.outlineStyle,
          outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
        };
      });
      expect(focused.outlineStyle, `${label} needs a visible focus outline`).not.toBe("none");
      expect(focused.outlineWidth, `${label} needs a visible focus outline`).toBeGreaterThanOrEqual(2);
      expect(
        colorIsTransparent(focused.outlineColor),
        `${label} focus outline cannot remain transparent`,
      ).toBe(false);

      await control.evaluate((element) => {
        element.disabled = true;
      });
      await expect(control).toBeDisabled();
      const disabled = await control.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          cursor: style.cursor,
          opacity: Number(style.opacity),
        };
      });
      expect(disabled.cursor, `${label} needs a disabled cursor signal`).toBe("not-allowed");
      expect(disabled.opacity, `${label} needs a visible disabled opacity signal`).toBeLessThanOrEqual(
        0.55,
      );
      await control.evaluate((element) => {
        element.disabled = false;
      });
    }
  });

  test(`${route} aligns single-line fields with the submit control`, async ({ page }) => {
    await gotoSettled(page, route);
    const form = page.locator("form[data-lead-form]");
    const dimensions = await form.evaluate((element) => {
      const renderedHeight = (control) =>
        Number(control.getBoundingClientRect().height.toFixed(2));
      const singleLineControls = [
        ...element.querySelectorAll(
          "input:not([type='hidden']):not([type='submit']):not([name='_gotcha']), select",
        ),
      ];
      const submit = element.querySelector("button[type='submit'], input[type='submit']");
      return {
        controls: singleLineControls.map((control) => ({
          height: renderedHeight(control),
          id: control.id,
        })),
        submit: submit
          ? {
              height: renderedHeight(submit),
              id: submit.id || submit.getAttribute("type"),
            }
          : null,
      };
    });

    expect(dimensions.controls.length).toBeGreaterThan(0);
    expect(dimensions.submit, "Each lead form needs a submit control").not.toBeNull();
    expect(
      dimensions.submit.height,
      "Submit controls must meet the 44px target minimum",
    ).toBeGreaterThanOrEqual(44);
    expect(
      dimensions.controls.filter(
        (control) =>
          control.height < 44 ||
          Math.abs(control.height - dimensions.submit.height) > 1,
      ),
      "Single-line fields and the adjacent submit action must share one rendered control height",
    ).toEqual([]);
  });
}

test("contact uses light native controls with intact browser validation", async ({ page }) => {
  await gotoSettled(page, "/contact/");
  const result = await page.locator("form[data-lead-form]").evaluate((form) => {
    const controls = [
      ...form.querySelectorAll(
        "input:not([type='hidden']):not([type='submit']):not([name='_gotcha']), select, textarea",
      ),
    ];
    const select = form.querySelector("select[required]");
    const originalNoValidate = form.noValidate;
    form.noValidate = false;
    const browserValidation = {
      formIsInvalid: !form.checkValidity(),
      firstInvalidHasMessage:
        controls.find((control) => !control.validity.valid)?.validationMessage.length > 0,
    };
    form.noValidate = originalNoValidate;

    return {
      browserValidation,
      controls: controls.map((control) => {
        const style = getComputedStyle(control);
        return {
          appearance: style.appearance,
          colorScheme: style.colorScheme,
          id: control.id,
        };
      }),
      select: select
        ? {
            optionCount: select.options.length,
            required: select.required,
            value: select.value,
          }
        : null,
    };
  });

  expect(result.browserValidation.formIsInvalid).toBe(true);
  expect(result.browserValidation.firstInvalidHasMessage).toBe(true);
  expect(result.select).not.toBeNull();
  expect(result.select.required).toBe(true);
  expect(result.select.value).toBe("");
  expect(result.select.optionCount).toBeGreaterThan(1);
  expect(
    result.controls.filter((control) => !/\blight\b/i.test(control.colorScheme)),
    "Warm-white Contact controls must explicitly request light UA rendering",
  ).toEqual([]);
  expect(
    result.controls.filter(
      (control) => control.id === "contact-project-type" && control.appearance === "none",
    ),
    "The native Contact select must retain its platform arrow and option affordance",
  ).toEqual([]);
});

test("link controls expose active and aria-disabled signals", async ({ page }) => {
  await gotoSettled(page, "/");
  const heroAction = page.locator(".hero-action").first();
  await expect(heroAction).toBeVisible();
  await expectActiveSignal(page, heroAction, "Homepage hero action");
  await heroAction.evaluate((element) => element.setAttribute("aria-disabled", "true"));
  const disabledLink = await heroAction.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      cursor: style.cursor,
      opacity: Number(style.opacity),
      pointerEvents: style.pointerEvents,
    };
  });
  expect(disabledLink.cursor).toBe("not-allowed");
  expect(disabledLink.opacity).toBeLessThanOrEqual(0.55);
  expect(disabledLink.pointerEvents).toBe("none");
});

test("button controls expose active and disabled signals", async ({ page }) => {
  await gotoSettled(page, "/contact/");
  const submit = page.locator("form[data-lead-form] button[type='submit']");
  await expect(submit).toBeVisible();
  await expectActiveSignal(page, submit, "Lead-form submit button");
  await submit.evaluate((element) => {
    element.disabled = true;
  });
  const disabledButton = await submit.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      cursor: style.cursor,
      opacity: Number(style.opacity),
      pointerEvents: style.pointerEvents,
    };
  });
  expect(disabledButton.cursor).toBe("not-allowed");
  expect(disabledButton.opacity).toBeLessThanOrEqual(0.55);
  expect(disabledButton.pointerEvents).toBe("none");
});

test("project placeholders are local, unique, and explicitly disclosed", async ({
  page,
  request,
}) => {
  const visuals = [];

  for (const slug of projectSlugs) {
    const route = `/projects/${slug}/`;
    await gotoSettled(page, route);

    await expect(page).toHaveTitle(/Concept Study/i);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /self-initiated.+concept study/i,
    );
    const mainText = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    expect(mainText).toMatch(/self-initiated.{0,50}concept study/i);
    expect(mainText).toMatch(/illustrative visual/i);
    expect(mainText).toMatch(/not completed client work/i);
    expect(mainText).toMatch(/placeholder/i);

    const visual = page.locator("main img.concept-board-image");
    await expect(visual).toHaveCount(1);
    await expect(visual).toBeVisible();
    const alt = await visual.getAttribute("alt");
    expect(alt).toMatch(/illustrative/i);
    expect(alt).toMatch(/self-initiated/i);

    const source = await visual.evaluate((image) => image.currentSrc);
    const parsedSource = new URL(source);
    expect(parsedSource.origin).toBe(new URL(page.url()).origin);
    expect(parsedSource.pathname).toContain(`/assets/projects/${slug}/`);
    const response = await request.get(source);
    expect(response.status(), `${slug} placeholder must return 200`).toBe(200);
    const body = await response.body();
    expect(body.byteLength, `${slug} placeholder must not be empty`).toBeGreaterThan(100);
    visuals.push({
      hash: crypto.createHash("sha256").update(body).digest("hex"),
      pathname: parsedSource.pathname,
      slug,
    });
  }

  expect(new Set(visuals.map((entry) => entry.pathname)).size).toBe(projectSlugs.length);
  expect(
    new Set(visuals.map((entry) => entry.hash)).size,
    "Every concept study must use a visually distinct local placeholder asset",
  ).toBe(projectSlugs.length);
});

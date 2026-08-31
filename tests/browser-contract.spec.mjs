import crypto from "node:crypto";
import { expect, test } from "@playwright/test";
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

const homeHeroViewports = [
  { width: 320, height: 812 },
  { width: 375, height: 812 },
  { width: 414, height: 896 },
  { width: 768, height: 900 },
  { width: 1440, height: 900 },
];

const shortHomeHeroViewports = [
  { width: 320, height: 480 },
  { width: 375, height: 568 },
  { width: 1440, height: 320 },
];

const navigationViewports = [320, 375, 390, 414, 768, 1280, 1440].map((width) => ({
  width,
  height: 900,
}));

const footerViewports = [320, 375, 414, 768, 1280, 1440].map((width) => ({
  width,
  height: 900,
}));

const canonicalFooterLinks = [
  { text: "Concept studies", href: "/projects/" },
  {
    text: "Commercial interior design",
    href: "/commercial-interior-design-montreal/",
  },
  { text: "Design journal", href: "/journal/" },
  { text: "Project inquiry", href: "/inquiry/" },
  { text: "Contact", href: "/contact/" },
];

const canonicalNavigationLinks = [
  { text: "Projects", href: "/projects/" },
  { text: "Journal", href: "/journal/" },
  { text: "Inquiry", href: "/inquiry/" },
  { text: "Contact", href: "/contact/" },
];

const navigationColor = "rgb(84, 39, 225)";

const navigationStyleProperties = {
  drawer: [
    "position",
    "top",
    "right",
    "bottom",
    "left",
    "transform",
    "display",
    "flexDirection",
    "alignItems",
    "justifyContent",
    "gap",
    "width",
    "maxWidth",
    "height",
    "minHeight",
    "maxHeight",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
    "boxSizing",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "borderTopStyle",
    "borderRightStyle",
    "borderBottomStyle",
    "borderLeftStyle",
    "borderTopColor",
    "borderRightColor",
    "borderBottomColor",
    "borderLeftColor",
    "borderRadius",
    "backgroundColor",
    "backgroundImage",
    "backdropFilter",
    "opacity",
    "visibility",
    "pointerEvents",
    "zIndex",
    "fontFamily",
  ],
  group: [
    "display",
    "flexDirection",
    "flexWrap",
    "alignItems",
    "justifyContent",
    "gap",
    "rowGap",
    "columnGap",
    "width",
    "maxWidth",
    "height",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
    "boxSizing",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "listStyleType",
  ],
  header: [
    "position",
    "top",
    "right",
    "bottom",
    "left",
    "transform",
    "display",
    "flexDirection",
    "alignItems",
    "justifyContent",
    "gap",
    "width",
    "maxWidth",
    "height",
    "minHeight",
    "maxHeight",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
    "boxSizing",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "borderTopStyle",
    "borderRightStyle",
    "borderBottomStyle",
    "borderLeftStyle",
    "borderTopColor",
    "borderRightColor",
    "borderBottomColor",
    "borderLeftColor",
    "borderRadius",
    "backgroundColor",
    "backgroundImage",
    "backdropFilter",
    "opacity",
    "zIndex",
    "fontFamily",
  ],
  label: [
    "display",
    "visibility",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "letterSpacing",
    "textTransform",
    "color",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
    "textDecorationLine",
  ],
  link: [
    "display",
    "position",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "letterSpacing",
    "textTransform",
    "whiteSpace",
    "color",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "borderTopStyle",
    "borderRightStyle",
    "borderBottomStyle",
    "borderLeftStyle",
    "borderTopColor",
    "borderRightColor",
    "borderBottomColor",
    "borderLeftColor",
    "textDecorationLine",
    "textDecorationStyle",
    "boxShadow",
    "backgroundColor",
    "backgroundImage",
    "outlineStyle",
    "outlineWidth",
    "outlineColor",
    "outlineOffset",
    "opacity",
  ],
  logo: [
    "display",
    "width",
    "minWidth",
    "maxWidth",
    "height",
    "minHeight",
    "maxHeight",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
    "boxSizing",
    "objectFit",
  ],
  overlay: [
    "position",
    "top",
    "right",
    "bottom",
    "left",
    "display",
    "width",
    "height",
    "backgroundColor",
    "backgroundImage",
    "backdropFilter",
    "opacity",
    "visibility",
    "pointerEvents",
    "zIndex",
  ],
  toggle: [
    "display",
    "visibility",
    "position",
    "width",
    "minWidth",
    "maxWidth",
    "height",
    "minHeight",
    "maxHeight",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
    "boxSizing",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "borderTopStyle",
    "borderRightStyle",
    "borderBottomStyle",
    "borderLeftStyle",
    "borderRadius",
    "backgroundColor",
    "backgroundImage",
    "color",
    "transform",
    "opacity",
  ],
};

async function gotoPublicDocument(page, documentCase) {
  if (documentCase.status === 404) {
    await gotoNotFoundSettled(page, documentCase.route);
    return;
  }
  await gotoSettled(page, documentCase.route);
}

async function captureFooterContract(page) {
  await page.waitForFunction(() => {
    const footer = document.querySelector('footer.site-footer[data-component="footer"]');
    return footer && footer.querySelectorAll("a[href]").length >= 8;
  });
  if (await page.locator("script[data-jq33-font-intent]").count()) {
    await page.keyboard.press("Tab");
    await page.waitForFunction(() => {
      const stylesheet = document.querySelector('link[data-jq33-font-only]');
      return stylesheet instanceof HTMLLinkElement && Boolean(stylesheet.sheet);
    });
  }
  await page.evaluate(() => document.fonts.ready);

  const structure = await page.evaluate(() => {
    const footer = document.querySelector('footer.site-footer[data-component="footer"]');
    const left = footer.querySelector(".info-pillar.pillar-left");
    const right = footer.querySelector(".info-pillar.pillar-right");
    const rightBlocks = [...right.querySelectorAll(":scope > .content-block")];
    const labels = [...footer.querySelectorAll(".label")];
    const anchors = [...footer.querySelectorAll("a[href]")];
    const rootBounds = footer.getBoundingClientRect();
    const round = (value) => Math.round(value * 100) / 100;
    const rect = (element) => {
      const bounds = element.getBoundingClientRect();
      return {
        height: round(bounds.height),
        relativeX: round(bounds.x - rootBounds.x),
        relativeY: round(bounds.y - rootBounds.y),
        width: round(bounds.width),
      };
    };
    const style = (element, properties, pseudo = null) => {
      const computed = getComputedStyle(element, pseudo);
      return Object.fromEntries(properties.map((property) => [property, computed[property]]));
    };
    const rootStyle = style(footer, [
      "borderTopColor",
      "borderTopStyle",
      "borderTopWidth",
      "backgroundColor",
      "backgroundImage",
      "boxSizing",
      "color",
      "columnGap",
      "display",
      "fontFamily",
      "gridTemplateColumns",
      "gridTemplateRows",
      "marginBottom",
      "marginLeft",
      "marginRight",
      "marginTop",
      "minHeight",
      "paddingBottom",
      "paddingLeft",
      "paddingRight",
      "paddingTop",
      "rowGap",
    ]);
    const pillarStyle = (element) => style(element, [
      "backgroundColor",
      "borderBottomWidth",
      "borderLeftWidth",
      "borderRadius",
      "borderRightWidth",
      "borderTopWidth",
      "color",
      "display",
      "gridTemplateColumns",
      "paddingBottom",
      "paddingLeft",
      "paddingRight",
      "paddingTop",
    ]);

    return {
      counts: {
        footer: document.querySelectorAll('footer.site-footer[data-component="footer"]').length,
        left: footer.querySelectorAll(".info-pillar.pillar-left").length,
        right: footer.querySelectorAll(".info-pillar.pillar-right").length,
        summaries: footer.querySelectorAll(".footer-summary").length,
      },
      className: footer.className,
      html: footer.innerHTML.replace(/\s+/g, " ").trim(),
      labels: labels.map((label) => ({
        rect: rect(label),
        style: style(label, ["color", "fontSize", "letterSpacing", "whiteSpace"]),
        text: label.textContent.replace(/\s+/g, " ").trim(),
      })),
      links: anchors.map((anchor) => ({
        clientWidth: anchor.clientWidth,
        href: anchor.getAttribute("href"),
        rect: rect(anchor),
        scrollWidth: anchor.scrollWidth,
        style: style(anchor, ["textDecorationLine", "whiteSpace"]),
        text: anchor.textContent.replace(/\s+/g, " ").trim(),
      })),
      navLinks: [...footer.querySelectorAll(".footer-nav a")].map((anchor) => ({
        href: anchor.getAttribute("href"),
        text: anchor.textContent.replace(/\s+/g, " ").trim(),
      })),
      overflow: {
        body: document.body.scrollWidth - document.body.clientWidth,
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        footer: footer.scrollWidth - footer.clientWidth,
      },
      pillars: {
        left: { rect: rect(left), style: pillarStyle(left) },
        right: { rect: rect(right), style: pillarStyle(right) },
      },
      rightBlocks: rightBlocks.map(rect),
      pseudo: style(footer, [
        "backgroundImage",
        "content",
        "display",
        "gridColumnStart",
        "gridRowStart",
        "height",
        "width",
      ], "::before"),
      root: {
        rect: {
          height: round(rootBounds.height),
          width: round(rootBounds.width),
          x: round(rootBounds.x),
        },
        style: rootStyle,
      },
      viewportWidth: window.innerWidth,
    };
  });

  const firstNavLink = page.locator(".site-footer .footer-nav a").first();
  await firstNavLink.focus();
  await expect(firstNavLink).toBeFocused();
  const focus = await firstNavLink.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      outlineStyle: computed.outlineStyle,
      outlineWidth: computed.outlineWidth,
      textDecorationLine: computed.textDecorationLine,
    };
  });

  return { focus, structure };
}

function expectFooterContract(captured, label) {
  const { focus, structure } = captured;
  expect(structure.counts, `${label} must mount exactly one unmodified shared footer`).toEqual({
    footer: 1,
    left: 1,
    right: 1,
    summaries: 0,
  });
  expect(structure.className, `${label} footer root must use the one shared class`).toBe("site-footer");
  expect(structure.navLinks, `${label} must use the approved descriptive footer destinations`).toEqual(
    canonicalFooterLinks,
  );
  expect(structure.root.style.borderTopStyle, `${label} footer must keep its top rule`).toBe("solid");
  expect(structure.root.style.borderTopWidth, `${label} footer rule must be one pixel`).toBe("1px");
  expect(structure.root.style.backgroundColor, `${label} footer must use the JQ33 dark surface`).toBe(
    "rgb(26, 26, 26)",
  );
  expect(structure.root.style.backgroundImage, `${label} footer must carry the JQ33 grain`).toMatch(
    /data:image\/svg\+xml/i,
  );
  expect(structure.root.style.color, `${label} footer must use warm-paper text`).toBe("rgb(246, 245, 240)");
  expect(structure.root.style.fontFamily.toLowerCase(), `${label} footer must use JQ33 sans typography`).toContain(
    "lato",
  );
  const expectedGutter = Math.min(24, Math.max(16, structure.viewportWidth * 0.016));
  expect(structure.root.rect.x, `${label} footer must use the shared viewport gutter`).toBeCloseTo(
    expectedGutter,
    1,
  );
  expect(structure.root.rect.width, `${label} footer must use the shared viewport width`).toBeCloseTo(
    structure.viewportWidth - expectedGutter * 2,
    1,
  );
  expect(
    structure.root.rect.x + structure.root.rect.width,
    `${label} footer must remain inside the viewport`,
  ).toBeLessThanOrEqual(structure.viewportWidth + 0.5);
  const expectedColumns = structure.viewportWidth <= 768 ? 1 : 3;
  const trackCount = (value) =>
    (value.match(/minmax\([^)]*\)|[^\s]+/g) || []).length;
  expect(
    trackCount(structure.root.style.gridTemplateColumns),
    `${label} footer must use ${expectedColumns} root column${expectedColumns === 1 ? "" : "s"}`,
  ).toBe(expectedColumns);
  expect(
    trackCount(structure.pillars.right.style.gridTemplateColumns),
    `${label} footer detail block must use ${expectedColumns} column${expectedColumns === 1 ? "" : "s"}`,
  ).toBe(expectedColumns);
  expect(structure.pillars.right.style.display, `${label} footer detail block must compute to grid`).toBe(
    "grid",
  );
  expect(
    new Set(structure.rightBlocks.map((block) => block.relativeX)).size,
    `${label} footer detail blocks must occupy ${expectedColumns} distinct column${expectedColumns === 1 ? "" : "s"}`,
  ).toBe(expectedColumns);
  expect(structure.pseudo.content, `${label} footer must render its logo pseudo-element`).not.toBe("none");
  expect(
    structure.pseudo.backgroundImage,
    `${label} footer must use the approved cobalt logo asset`,
  ).toMatch(/logo(?:%20| )purple(?:%20| )svg\.svg/i);
  for (const [name, pillar] of Object.entries(structure.pillars)) {
    expect(pillar.style.backgroundColor, `${label} ${name} pillar must remain transparent`).toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(pillar.style.borderRadius, `${label} ${name} pillar must remain square`).toBe("0px");
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      expect(pillar.style[`border${side}Width`], `${label} ${name} pillar must remain unboxed`).toBe(
        "0px",
      );
      expect(pillar.style[`padding${side}`], `${label} ${name} pillar must remain unboxed`).toBe(
        "0px",
      );
    }
  }
  for (const footerLabel of structure.labels) {
    expect(footerLabel.style.color, `${label} footer labels must use bright cobalt`).toBe(
      "rgb(112, 117, 235)",
    );
    expect(footerLabel.style.whiteSpace, `${label} footer labels must not wrap`).toBe("nowrap");
  }
  for (const link of structure.links) {
    expect(link.rect.width, `${label} ${link.text || link.href} target must be at least 44px wide`).toBeGreaterThanOrEqual(
      44,
    );
    expect(link.rect.height, `${label} ${link.text || link.href} target must be at least 44px tall`).toBeGreaterThanOrEqual(
      44,
    );
    expect(link.style.whiteSpace, `${label} ${link.text || link.href} must stay on one line`).toBe(
      "nowrap",
    );
    expect(link.style.textDecorationLine, `${label} ${link.text || link.href} must not be underlined`).toBe(
      "none",
    );
    expect(link.scrollWidth, `${label} ${link.text || link.href} must not clip`).toBeLessThanOrEqual(
      link.clientWidth,
    );
  }
  expect(structure.overflow, `${label} footer must not create horizontal overflow`).toEqual({
    body: 0,
    document: 0,
    footer: 0,
  });
  expect(focus.outlineStyle, `${label} footer keyboard focus must remain visible`).not.toBe("none");
  expect(Number.parseFloat(focus.outlineWidth), `${label} footer focus outline must be at least 2px`).toBeGreaterThanOrEqual(
    2,
  );
  expect(focus.textDecorationLine, `${label} focused footer links must not be underlined`).toBe("none");
}

async function captureNavigationElementState(locator) {
  return locator.evaluate((element, properties) => {
    const style = getComputedStyle(element);
    const pseudo = (name) => {
      const computed = getComputedStyle(element, name);
      return {
        backgroundColor: computed.backgroundColor,
        backgroundImage: computed.backgroundImage,
        borderBottomStyle: computed.borderBottomStyle,
        borderBottomWidth: computed.borderBottomWidth,
        boxShadow: computed.boxShadow,
        content: computed.content,
        display: computed.display,
        height: computed.height,
        transform: computed.transform,
        width: computed.width,
      };
    };
    return {
      pseudoAfter: pseudo("::after"),
      pseudoBefore: pseudo("::before"),
      style: Object.fromEntries(properties.map((property) => [property, style[property]])),
    };
  }, navigationStyleProperties.link);
}

async function captureNavigationInteractionStates(page, locator, { exactColor = false } = {}) {
  const states = {};
  states.normal = await captureNavigationElementState(locator);

  await locator.hover();
  states.hover = await captureNavigationElementState(locator);

  await page.keyboard.press("Tab");
  await locator.focus();
  await expect(locator).toBeFocused();
  states.focus = await captureNavigationElementState(locator);

  const box = await locator.boundingBox();
  expect(box, "Navigation control must expose a rendered pointer target").not.toBeNull();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  states.active = await captureNavigationElementState(locator);
  await page.mouse.move(0, 0);
  await page.mouse.up();

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });

  states.current = await locator.evaluate(
    (element, properties) => {
      const previous = element.getAttribute("aria-current");
      element.setAttribute("aria-current", "page");
      const style = getComputedStyle(element);
      const pseudo = (name) => {
        const computed = getComputedStyle(element, name);
        return {
          backgroundColor: computed.backgroundColor,
          backgroundImage: computed.backgroundImage,
          borderBottomStyle: computed.borderBottomStyle,
          borderBottomWidth: computed.borderBottomWidth,
          boxShadow: computed.boxShadow,
          content: computed.content,
          display: computed.display,
          height: computed.height,
          transform: computed.transform,
          width: computed.width,
        };
      };
      const captured = {
        pseudoAfter: pseudo("::after"),
        pseudoBefore: pseudo("::before"),
        style: Object.fromEntries(properties.map((property) => [property, style[property]])),
      };
      if (previous === null) element.removeAttribute("aria-current");
      else element.setAttribute("aria-current", previous);
      return captured;
    },
    navigationStyleProperties.link,
  );

  for (const [state, captured] of Object.entries(states)) {
    const style = captured.style;
    expect(style.textDecorationLine, `${state} navigation text must not be underlined`).toBe(
      "none",
    );
    const bottomBorderIsIsolated =
      style.borderBottomWidth !== "0px" &&
      !["Top", "Right", "Left"].every(
        (side) =>
          style[`border${side}Width`] === style.borderBottomWidth &&
          style[`border${side}Style`] === style.borderBottomStyle &&
          style[`border${side}Color`] === style.borderBottomColor,
      );
    expect(
      bottomBorderIsIsolated,
      `${state} navigation text must not draw an isolated bottom-border underline`,
    ).toBe(false);
    if (exactColor) {
      expect(style.boxShadow, `${state} primary navigation text must not draw a shadow underline`).toBe(
        "none",
      );
    }
    expect(style.backgroundImage, `${state} navigation text must not draw a gradient underline`).toBe(
      "none",
    );
    for (const [name, pseudo] of [
      ["before", captured.pseudoBefore],
      ["after", captured.pseudoAfter],
    ]) {
      expect(
        ["none", "normal"],
        `${state} navigation text must not draw a ::${name} line`,
      ).toContain(pseudo.content);
    }
    if (exactColor) {
      expect(style.color, `${state} primary navigation color must be #5427E1`).toBe(
        navigationColor,
      );
      expect(style.fontFamily.toLowerCase(), `${state} primary navigation must use Lato`).toContain(
        "lato",
      );
    }
  }

  expect(states.focus.style.outlineStyle, "Keyboard focus must remain visible without an underline").not.toBe(
    "none",
  );
  expect(
    Number.parseFloat(states.focus.style.outlineWidth),
    "Keyboard focus outline must remain at least 2px",
  ).toBeGreaterThanOrEqual(2);

  return states;
}

async function captureNavigationContract(page, viewport) {
  await page.emulateMedia({ reducedMotion: "reduce" });

  const structure = await page.evaluate((properties) => {
    const header = document.querySelector('header.header-nav[data-component="header-nav"]');
    const home = header?.querySelector("a.nav-item");
    const logo = header?.querySelector(".nav-logo");
    const label = header?.querySelector(".nav-item .label");
    const primary = header?.querySelector('nav[aria-label="Primary"]');
    const group = header?.querySelector(".nav-group");
    const toggle = header?.querySelector(".nav-toggle");
    const toggleBars = toggle?.querySelector(".nav-toggle-bars");
    const overlay = document.querySelector(".nav-overlay[data-nav-overlay]");
    const drawer = document.querySelector("#site-nav-drawer.nav-drawer");
    const drawerTitle = drawer?.querySelector(".drawer-title");
    const drawerNav = drawer?.querySelector('nav[aria-label="Mobile"]');
    const style = (element, names) => {
      const computed = getComputedStyle(element);
      return Object.fromEntries(names.map((name) => [name, computed[name]]));
    };
    const rect = (element) => {
      const bounds = element.getBoundingClientRect();
      return {
        height: bounds.height,
        width: bounds.width,
        x: bounds.x,
        y: bounds.y,
      };
    };
    const links = (root, selector) =>
      [...root.querySelectorAll(selector)].map((link) => ({
        href: new URL(link.href).pathname,
        text: link.textContent.replace(/\s+/g, " ").trim(),
      }));

    return {
      counts: {
        drawer: document.querySelectorAll("#site-nav-drawer.nav-drawer").length,
        header: document.querySelectorAll(
          'header.header-nav[data-component="header-nav"]',
        ).length,
        home: header?.querySelectorAll("a.nav-item").length ?? 0,
        overlay: document.querySelectorAll(".nav-overlay[data-nav-overlay]").length,
        primary: header?.querySelectorAll('nav[aria-label="Primary"]').length ?? 0,
        toggle: header?.querySelectorAll("button.nav-toggle[data-nav-toggle]").length ?? 0,
      },
      drawer: {
        ariaHidden: drawer?.getAttribute("aria-hidden"),
        inert: drawer?.inert,
        links: drawer ? links(drawerNav, ":scope > a") : [],
        rect: rect(drawer),
        style: style(drawer, properties.drawer),
        title: {
          style: style(drawerTitle, properties.label),
          text: drawerTitle?.textContent.trim(),
        },
      },
      group: {
        rect: rect(group),
        style: style(group, properties.group),
      },
      header: {
        rect: rect(header),
        style: style(header, properties.header),
      },
      home: {
        accessibleName: home?.getAttribute("aria-label"),
        href: home ? new URL(home.href).pathname : "",
        label: label?.textContent.trim(),
        labelRect: rect(label),
        labelStyle: style(label, properties.label),
        linkAfterContent: getComputedStyle(home, "::after").content,
        linkBeforeContent: getComputedStyle(home, "::before").content,
        linkStyle: style(home, properties.link),
        logoAlt: logo?.getAttribute("alt"),
        logoRect: rect(logo),
        logoSrc: logo ? new URL(logo.src).pathname : "",
        logoStyle: style(logo, properties.logo),
      },
      links: links(primary, ".nav-link"),
      overflow: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: Math.max(
          document.documentElement.scrollWidth,
          document.body?.scrollWidth || 0,
        ),
      },
      overlay: {
        rect: rect(overlay),
        style: style(overlay, properties.overlay),
      },
      toggle: {
        ariaControls: toggle?.getAttribute("aria-controls"),
        ariaExpanded: toggle?.getAttribute("aria-expanded"),
        ariaLabel: toggle?.getAttribute("aria-label"),
        bars: {
          items: [...toggleBars.querySelectorAll(":scope > span")].map((bar) => ({
            rect: rect(bar),
            style: style(bar, ["backgroundColor", "display", "height", "width"]),
          })),
          rect: rect(toggleBars),
          style: style(toggleBars, [
            "display",
            "flexDirection",
            "justifyContent",
            "height",
            "transform",
            "width",
          ]),
        },
        rect: rect(toggle),
        style: style(toggle, properties.toggle),
      },
      tokens: {
        color: getComputedStyle(document.documentElement)
          .getPropertyValue("--color-nav")
          .trim(),
        surface: getComputedStyle(document.documentElement)
          .getPropertyValue("--color-nav-surface")
          .trim(),
      },
    };
  }, navigationStyleProperties);

  expect(structure.counts).toEqual({
    drawer: 1,
    header: 1,
    home: 1,
    overlay: 1,
    primary: 1,
    toggle: 1,
  });
  expect(structure.home).toMatchObject({
    accessibleName: "JQ33 DESIGN Home",
    href: "/",
    label: "JQ33 DESIGN",
    logoAlt: "JQ33 DESIGN",
    logoSrc: "/assets/logo/logo%20purple%20svg.svg",
  });
  expect(structure.links).toEqual(canonicalNavigationLinks);
  expect(structure.drawer.links).toEqual(canonicalNavigationLinks);
  expect(structure.header.style.position).toBe("fixed");
  expect(structure.header.style.alignItems).toBe("center");
  expect(structure.header.style.fontFamily.toLowerCase()).toContain("lato");
  expect(structure.home.labelStyle.color).toBe(navigationColor);
  expect(structure.home.labelStyle.fontFamily.toLowerCase()).toContain("lato");
  expect(structure.home.labelStyle.display).not.toBe("none");
  expect(structure.home.labelStyle.visibility).not.toBe("hidden");
  expect(structure.home.linkStyle.textDecorationLine).toBe("none");
  expect(structure.home.linkStyle.borderBottomWidth).toBe("0px");
  expect(structure.home.linkStyle.boxShadow).toBe("none");
  expect(structure.home.linkStyle.backgroundImage).toBe("none");
  expect(["none", "normal"]).toContain(structure.home.linkBeforeContent);
  expect(["none", "normal"]).toContain(structure.home.linkAfterContent);
  expect(structure.drawer.title.text).toBe("Menu");
  expect(structure.drawer.title.style.color).toBe(navigationColor);
  expect(structure.drawer.title.style.fontFamily.toLowerCase()).toContain("lato");
  expect(structure.tokens.color.toLowerCase()).toBe("#5427e1");
  expect(structure.tokens.surface).not.toBe("");
  expect(structure.header.style.backgroundColor).toBe("rgb(246, 245, 240)");
  expect(structure.overflow.scrollWidth).toBeLessThanOrEqual(structure.overflow.clientWidth + 1);

  const mobile = viewport.width <= 768;
  const primaryLinks = page.locator(
    mobile ? "#site-nav-drawer nav[aria-label='Mobile'] > a" : "header.header-nav .nav-link",
  );
  const primaryLinkCount = await primaryLinks.count();
  expect(primaryLinkCount).toBe(canonicalNavigationLinks.length);

  let open = null;
  if (mobile) {
    expect(["flex", "inline-flex"]).toContain(structure.toggle.style.display);
    expect(structure.toggle.rect.width).toBeGreaterThanOrEqual(44);
    expect(structure.toggle.rect.height).toBeGreaterThanOrEqual(44);
    expect(structure.toggle.style.color).toBe(navigationColor);
    expect(structure.toggle.bars.items).toHaveLength(3);
    expect(
      structure.toggle.bars.items.map((bar) => bar.style.backgroundColor),
    ).toEqual(Array(3).fill(navigationColor));
    expect(structure.group.style.display).toBe("none");
    expect(structure.toggle.ariaControls).toBe("site-nav-drawer");
    expect(structure.toggle.ariaExpanded).toBe("false");
    expect(structure.drawer.ariaHidden).toBe("true");
    expect(structure.drawer.inert).toBe(true);

    await page.locator("header.header-nav .nav-toggle").click();
    await expect(page.locator("body")).toHaveClass(/\bis-nav-open\b/);
    await expect(primaryLinks.first()).toBeFocused();
    open = await page.evaluate((properties) => {
      const drawer = document.querySelector("#site-nav-drawer");
      const overlay = document.querySelector(".nav-overlay[data-nav-overlay]");
      const toggle = document.querySelector("header.header-nav .nav-toggle");
      const style = (element, names) => {
        const computed = getComputedStyle(element);
        return Object.fromEntries(names.map((name) => [name, computed[name]]));
      };
      const rect = (element) => {
        const bounds = element.getBoundingClientRect();
        return { height: bounds.height, width: bounds.width, x: bounds.x, y: bounds.y };
      };
      return {
        bodyOpen: document.body.classList.contains("is-nav-open"),
        drawer: {
          ariaHidden: drawer.getAttribute("aria-hidden"),
          inert: drawer.inert,
          rect: rect(drawer),
          style: style(drawer, properties.drawer),
        },
        overlay: {
          ariaHidden: overlay.getAttribute("aria-hidden"),
          rect: rect(overlay),
          style: style(overlay, properties.overlay),
        },
        toggle: {
          ariaExpanded: toggle.getAttribute("aria-expanded"),
          ariaLabel: toggle.getAttribute("aria-label"),
          style: style(toggle, properties.toggle),
        },
      };
    }, navigationStyleProperties);
    expect(open).toMatchObject({
      bodyOpen: true,
      drawer: { ariaHidden: "false", inert: false },
      overlay: { ariaHidden: "false" },
      toggle: { ariaExpanded: "true", ariaLabel: "Close menu" },
    });
    expect(open.drawer.style.fontFamily.toLowerCase()).toContain("lato");
  } else {
    expect(structure.group.style.display).toBe("flex");
    expect(structure.toggle.style.display).toBe("none");
    expect(structure.drawer.ariaHidden).toBe("true");
    expect(structure.drawer.inert).toBe(true);
  }

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  const primaryStates = [];
  for (let index = 0; index < primaryLinkCount; index += 1) {
    const states = await captureNavigationInteractionStates(page, primaryLinks.nth(index), {
      exactColor: true,
    });
    if (!mobile) {
      expect(states.normal.style.fontSize).toBe("12.48px");
      expect(states.normal.style.fontWeight).toBe("600");
      expect(states.normal.style.letterSpacing).toBe("1px");
      expect(states.normal.style.textTransform).toBe("uppercase");
    }
    primaryStates.push(states);
  }

  const ctaStates = [];
  if (mobile) {
    const ctas = page.locator("#site-nav-drawer .drawer-ctas a");
    expect(await ctas.count()).toBe(2);
    for (let index = 0; index < (await ctas.count()); index += 1) {
      ctaStates.push(await captureNavigationInteractionStates(page, ctas.nth(index)));
    }
    await ctas.last().focus();
    await page.keyboard.press("Tab");
    await expect(primaryLinks.first()).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(ctas.last()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("body")).not.toHaveClass(/\bis-nav-open\b/);
    await expect(page.locator("header.header-nav .nav-toggle")).toBeFocused();
  }

  return { ctaStates, open, primaryStates, structure };
}

function expectRectWithinTolerance(actual, expected, label) {
  for (const property of ["x", "y", "width", "height"]) {
    expect(
      Math.abs(actual[property] - expected[property]),
      `${label} ${property} must remain within 0.5 CSS px`,
    ).toBeLessThanOrEqual(0.5);
  }
}

function expectNavigationMatchesCanonical(actual, canonical, label) {
  for (const path of [
    ["structure", "header", "rect"],
    ["structure", "group", "rect"],
    ["structure", "home", "logoRect"],
    ["structure", "home", "labelRect"],
    ["structure", "toggle", "rect"],
    ["structure", "toggle", "bars", "rect"],
    ["structure", "drawer", "rect"],
    ["structure", "overlay", "rect"],
  ]) {
    const actualRect = path.reduce((value, key) => value[key], actual);
    const canonicalRect = path.reduce((value, key) => value[key], canonical);
    expectRectWithinTolerance(actualRect, canonicalRect, `${label} ${path.slice(1, -1).join(".")}`);
  }
  if (actual.open && canonical.open) {
    expectRectWithinTolerance(actual.open.drawer.rect, canonical.open.drawer.rect, `${label} open drawer`);
    expectRectWithinTolerance(actual.open.overlay.rect, canonical.open.overlay.rect, `${label} open overlay`);
  }
  for (let index = 0; index < actual.structure.toggle.bars.items.length; index += 1) {
    expectRectWithinTolerance(
      actual.structure.toggle.bars.items[index].rect,
      canonical.structure.toggle.bars.items[index].rect,
      `${label} toggle bar ${index + 1}`,
    );
  }

  const withoutRects = (value) => JSON.parse(
    JSON.stringify(value, (key, nested) => {
      if (key === "tokens" || key === "rect" || key.endsWith("Rect")) return undefined;
      if (key === "fontFamily" && typeof nested === "string") {
        // These aliases are exact Lato subsets; the dedicated CDP font contract
        // proves the rendered face while this comparison stays presentation-led.
        return nested.replace(/^"JQ33 (?:Home|Commercial) Critical Lato"/, "Lato");
      }
      return nested;
    }),
  );
  expect(withoutRects(actual), `${label} shared navigation presentation must be identical`).toEqual(
    withoutRects(canonical),
  );
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

  test(`${documentCase.route} uses its approved heading and UI typography`, async ({
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
      const isHomepageHeroType = (element) =>
        document.body.classList.contains("is-home") &&
        Boolean(element.closest("#home")) &&
        !element.closest(".brand-mark");
      const isProjectsIndexUi = (element) =>
        document.body.classList.contains("concept-index") &&
        Boolean(element.closest(".concept-index")) &&
        !element.closest("header.header-nav, #site-nav-drawer, .nav-overlay, .site-footer");

      const headings = [
        ...document.querySelectorAll("h1, h2, h3, h4, h5, h6, [role='heading']"),
      ];
      const displayMarks = [...document.querySelectorAll(".brand-mark")].filter(rendered);
      const ui = [...document.querySelectorAll(selector)].filter(rendered);
      const heroCopy = [
        ...document.querySelectorAll(
          "#home .header-tagline, #home .header-subheadline, #home .info-pillar, #home .hero-action",
        ),
      ].filter(rendered);
      return {
        headings: fontRows(headings.filter((element) => !isHomepageHeroType(element))),
        heroCopy: fontRows(heroCopy),
        heroHeadings: fontRows(headings.filter(isHomepageHeroType)),
        displayMarks: fontRows(displayMarks),
        projectsIndexUi: fontRows(ui.filter(isProjectsIndexUi)),
        ui: fontRows(
          ui.filter(
            (element) =>
              !isHomepageHeroType(element) && !isProjectsIndexUi(element),
          ),
        ),
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
      "Body UI and shared navigation chrome outside approved hero/Projects content must compute to Lato",
    ).toEqual([]);
    expect(
      typography.projectsIndexUi.filter(
        (entry) => !fontIncludes(entry.fontFamily, "Inter"),
      ),
      "Projects index content UI, metadata, and actions must compute to Inter",
    ).toEqual([]);
    expect(
      typography.heroCopy.filter((entry) => !fontIncludes(entry.fontFamily, "Inter")),
      "Homepage hero copy, metadata, and actions must compute to Inter",
    ).toEqual([]);
    expect(
      typography.heroHeadings.filter((entry) => !fontIncludes(entry.fontFamily, "Inter")),
      "Homepage hero headings must compute to Inter without changing other heading typography",
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

  test(`${documentCase.route} keeps intended navigation alignment and CTA labels on one line`, async ({
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
        `Header items must use the shared centered alignment at ${viewport.width}px`,
      ).toBe("center");
      expect(
        navigationAndActions.wrapped,
        `CTA labels must remain on one line at ${viewport.width}px`,
      ).toEqual([]);
    }
  });
}

for (const viewport of navigationViewports) {
  test(`shared navigation is identical across every public route at ${viewport.width}px`, async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await page.setViewportSize(viewport);
    await gotoSettled(page, "/contact/");
    const canonical = await captureNavigationContract(page, viewport);

    for (const documentCase of publicDocumentCases) {
      await gotoPublicDocument(page, documentCase);
      const actual = await captureNavigationContract(page, viewport);
      expectNavigationMatchesCanonical(
        actual,
        canonical,
        `${documentCase.route} at ${viewport.width}px`,
      );
    }
  });
}

for (const viewport of footerViewports) {
  test(`shared Ft4 footer is identical across every public route at ${viewport.width}px`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    await gotoSettled(page, "/projects/");
    const canonical = await captureFooterContract(page);
    expectFooterContract(canonical, `/projects/ at ${viewport.width}px`);

    for (const documentCase of publicDocumentCases) {
      await gotoPublicDocument(page, documentCase);
      const actual = await captureFooterContract(page);
      const label = `${documentCase.route} at ${viewport.width}px`;
      expectFooterContract(actual, label);
      expect(actual.structure, `${label} footer must match the Projects reference contract`).toEqual(
        canonical.structure,
      );
    }
  });
}

test("homepage hero CTAs stay in the lower region without colliding at parity viewports", async ({
  page,
}) => {
  for (const viewport of homeHeroViewports) {
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
      const rect = (element) => {
        const bounds = element.getBoundingClientRect();
        return {
          bottom: bounds.bottom,
          height: bounds.height,
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
          width: bounds.width,
        };
      };
      const intersects = (first, second) =>
        Math.min(first.right, second.right) - Math.max(first.left, second.left) > 2 &&
        Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > 2;

      const hero = document.querySelector("#home");
      const actionsGroup = hero?.querySelector(".hero-actions");
      const actions = [...(hero?.querySelectorAll(".hero-action") || [])].filter(rendered);
      const navGroup = document.querySelector("body.is-home > header.header-nav .nav-group");
      const toggle = document.querySelector("body.is-home > header.header-nav .nav-toggle");
      const headerControls = [
        ...document.querySelectorAll(
          "body.is-home > header.header-nav a[href], body.is-home > header.header-nav button",
        ),
      ].filter(rendered);
      const nonActions = [
        ...headerControls,
        hero?.querySelector(".header-tagline"),
        hero?.querySelector(".header-subheadline"),
        hero?.querySelector(".brand-mark__text"),
        ...hero.querySelectorAll(".info-pillar"),
      ].filter(rendered);
      const actionCollisions = actions.flatMap((action) => {
        const actionRect = rect(action);
        return nonActions
          .filter((element) => intersects(actionRect, rect(element)))
          .map((element) => `${describe(action)} <> ${describe(element)}`);
      });
      const actionPairCollision =
        actions.length === 2 && intersects(rect(actions[0]), rect(actions[1]));
      const containedElements = [...actions, ...nonActions];
      const offCanvas = containedElements
        .filter((element) => {
          const bounds = rect(element);
          return bounds.left < -1 || bounds.right > innerWidth + 1;
        })
        .map(describe);
      const heroRect = hero ? rect(hero) : null;
      const groupRect = rendered(actionsGroup) ? rect(actionsGroup) : null;
      const availability = [...(hero?.querySelectorAll(".pillar-left .content-block") || [])].find(
        (block) => block.querySelector(".label")?.textContent.trim() === "Availability",
      );
      const rightPillar = hero?.querySelector(".pillar-right");

      return {
        actionCollisions,
        actionPairCollision,
        actionRadii: actions.map((action) => getComputedStyle(action).borderRadius),
        actions: actions.map((action) => ({
          ...rect(action),
          text: action.textContent.trim(),
        })),
        availabilityInDom: availability instanceof HTMLElement,
        availabilityRendered: rendered(availability),
        availabilityText: availability?.textContent.replace(/\s+/g, " ").trim() || "",
        desktopGroupCentered:
          heroRect && groupRect
            ? Math.abs(groupRect.left + groupRect.width / 2 - (heroRect.left + heroRect.width / 2))
            : Number.POSITIVE_INFINITY,
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        groupBottomGap:
          heroRect && groupRect ? Math.min(heroRect.bottom, innerHeight) - groupRect.bottom : -1,
        groupInLowerRegion:
          heroRect && groupRect
            ? groupRect.top + groupRect.height / 2 >= heroRect.top + heroRect.height / 2
            : false,
        groupRendered: rendered(actionsGroup),
        navGroupRendered: rendered(navGroup),
        navGroupWidth: navGroup?.getBoundingClientRect().width ?? -1,
        offCanvas,
        rightPillarRendered: rendered(rightPillar),
        toggleDisplay: toggle ? getComputedStyle(toggle).display : "missing",
        toggleRendered: rendered(toggle),
      };
    });

    const label = `${viewport.width}x${viewport.height}`;
    const mobileNavigation = viewport.width <= 768;
    expect(layout.documentScrollWidth, `Document must not overflow horizontally at ${label}`).toBeLessThanOrEqual(
      layout.documentClientWidth + 1,
    );
    expect(layout.groupRendered, `Hero CTA group must render at ${label}`).toBe(true);
    expect(layout.actions.map((action) => action.text)).toEqual(["Book a call", "View projects"]);
    expect(
      layout.actions.filter((action) => action.width < 44 || action.height < 44),
      `Each hero CTA needs a 44px practical hit area at ${label}`,
    ).toEqual([]);
    expect(layout.actionRadii, `Hero CTAs must stay square at ${label}`).toEqual(["0px", "0px"]);
    expect(layout.groupInLowerRegion, `Hero CTA group must stay in the lower hero region at ${label}`).toBe(
      true,
    );
    expect(layout.groupBottomGap, `Hero CTA group must keep viewport-safe bottom spacing at ${label}`).toBeGreaterThanOrEqual(
      8,
    );
    expect(layout.actionPairCollision, `Hero CTAs must not overlap each other at ${label}`).toBe(false);
    expect(
      layout.actionCollisions,
      `Hero CTAs must not collide with old-hero content or navigation at ${label}`,
    ).toEqual([]);
    expect(layout.offCanvas, `Visible hero elements must stay inside the viewport at ${label}`).toEqual([]);
    expect(layout.availabilityInDom, `Availability must remain in the DOM at ${label}`).toBe(true);
    expect(layout.availabilityText).toBe(
      "Availability Now booking: Next 2-4 weeks Fast turnaround options (7-14 days)",
    );
    expect(layout.availabilityRendered, `Availability visibility must match the old breakpoint at ${label}`).toBe(
      viewport.width >= 480,
    );
    expect(layout.rightPillarRendered, `Right metadata visibility must match the old breakpoint at ${label}`).toBe(
      !mobileNavigation,
    );
    expect(layout.navGroupRendered, `Desktop navigation visibility must match the old breakpoint at ${label}`).toBe(
      !mobileNavigation,
    );
    expect(layout.toggleRendered, `Mobile menu visibility must match the old breakpoint at ${label}`).toBe(
      mobileNavigation,
    );
    if (mobileNavigation) {
      expect(layout.navGroupWidth, `Hidden desktop nav must reserve no width at ${label}`).toBe(0);
      expect(["flex", "inline-flex"], `Mobile menu must use a flex control at ${label}`).toContain(
        layout.toggleDisplay,
      );
    } else {
      expect(layout.desktopGroupCentered, `Desktop hero CTAs must be bottom-centered at ${label}`).toBeLessThanOrEqual(
        1,
      );
    }
  }
});

test("homepage hero remains collision-free and reachable at short viewport heights", async ({
  page,
}) => {
  for (const viewport of shortHomeHeroViewports) {
    await page.setViewportSize(viewport);
    await gotoSettled(page, "/");
    await page.locator("#home .hero-actions").scrollIntoViewIfNeeded();

    const layout = await page.evaluate(() => {
      const rendered = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) > 0 &&
          bounds.width > 1 &&
          bounds.height > 1
        );
      };
      const rect = (element) => {
        const bounds = element.getBoundingClientRect();
        return {
          bottom: bounds.bottom,
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
        };
      };
      const intersects = (first, second) =>
        Math.min(first.right, second.right) - Math.max(first.left, second.left) > 2 &&
        Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > 2;
      const describe = (element) =>
        `${element.tagName.toLowerCase()}${element.classList.length ? `.${[...element.classList].join(".")}` : ""}`;

      const pageScroller = document.querySelector(".page");
      const hero = document.querySelector("#home");
      const actionsGroup = hero?.querySelector(".hero-actions");
      const actions = [...(hero?.querySelectorAll(".hero-action") || [])].filter(rendered);
      const preservedHeroContent = [
        hero?.querySelector(".brand-mark__text"),
        hero?.querySelector(".header-tagline"),
        hero?.querySelector(".header-subheadline"),
        ...hero.querySelectorAll(".info-pillar"),
      ].filter(rendered);
      const actionCollisions = actions.flatMap((action) => {
        const actionRect = rect(action);
        return preservedHeroContent
          .filter((element) => intersects(actionRect, rect(element)))
          .map((element) => `${describe(action)} <> ${describe(element)}`);
      });
      const heroRect = rect(hero);
      const contentOutsideHero = [...actions, ...preservedHeroContent]
        .filter((element) => {
          const bounds = rect(element);
          return (
            bounds.left < heroRect.left - 1 ||
            bounds.right > heroRect.right + 1 ||
            bounds.top < heroRect.top - 1 ||
            bounds.bottom > heroRect.bottom + 1
          );
        })
        .map(describe);
      const groupRect = rect(actionsGroup);

      return {
        actionCollisions,
        actionPairCollision:
          actions.length === 2 && intersects(rect(actions[0]), rect(actions[1])),
        actionRadii: actions.map((action) => getComputedStyle(action).borderRadius),
        contentOutsideHero,
        groupInViewport: groupRect.top >= -1 && groupRect.bottom <= innerHeight + 1,
        heroHeight: heroRect.bottom - heroRect.top,
        pageScrollTop: pageScroller?.scrollTop ?? 0,
      };
    });

    const label = `${viewport.width}x${viewport.height}`;
    expect(layout.heroHeight, `Short-height hero must provide a scrollable canvas at ${label}`).toBeGreaterThan(
      viewport.height,
    );
    expect(layout.pageScrollTop, `Hero CTA must be reachable by scrolling at ${label}`).toBeGreaterThan(0);
    expect(layout.groupInViewport, `Hero CTA group must scroll fully into view at ${label}`).toBe(true);
    expect(layout.actionRadii, `Hero CTAs must stay square at ${label}`).toEqual(["0px", "0px"]);
    expect(layout.actionPairCollision, `Hero CTAs must not overlap each other at ${label}`).toBe(false);
    expect(layout.actionCollisions, `Hero CTAs must not cover old-hero content at ${label}`).toEqual([]);
    expect(layout.contentOutsideHero, `Required hero content must stay reachable inside the hero at ${label}`).toEqual(
      [],
    );
  }
});

test("homepage hero keeps the old transparent cobalt photograph composition", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoSettled(page, "/");

  const composition = await page.evaluate(() => {
    const transparent = (value) => {
      const normalized = String(value).replace(/\s+/g, "").toLowerCase();
      return (
        normalized === "transparent" ||
        normalized === "rgba(0,0,0,0)" ||
        normalized.endsWith(",0)") ||
        normalized.endsWith("/0)")
      );
    };
    const surface = (element) => {
      const style = getComputedStyle(element);
      return {
        backdropFilter: style.backdropFilter || style.webkitBackdropFilter || "none",
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius,
        borderWidths: [
          style.borderTopWidth,
          style.borderRightWidth,
          style.borderBottomWidth,
          style.borderLeftWidth,
        ].map(Number.parseFloat),
        boxShadow: style.boxShadow,
        color: style.color,
        element: element.className,
        padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(
          Number.parseFloat,
        ),
        transparent: transparent(style.backgroundColor),
      };
    };
    const hero = document.querySelector("#home");
    const photo = hero.querySelector(".bg-layer");
    const image = photo.querySelector("img");
    const photoStyle = getComputedStyle(photo);
    const transform = new DOMMatrixReadOnly(photoStyle.transform);
    const pseudo = ["::before", "::after"].map((selector) => {
      const style = getComputedStyle(hero, selector);
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        selector,
        transparent: transparent(style.backgroundColor),
      };
    });
    const normalize = (value) => value.replace(/\s+/g, " ").trim();
    return {
      desktopNavLinkColors: [
        ...document.querySelectorAll("body.is-home > .header-nav .nav-link"),
      ].map((link) => getComputedStyle(link).color),
      grainBackground: getComputedStyle(hero.querySelector(".grain")).backgroundImage,
      image: {
        objectFit: getComputedStyle(image).objectFit,
        objectPosition: getComputedStyle(image).objectPosition,
      },
      leftMetadata: normalize(hero.querySelector(".pillar-left").textContent),
      photo: {
        filter: photoStyle.filter,
        opacity: Number(photoStyle.opacity),
        scaleX: transform.a,
        scaleY: transform.d,
      },
      pseudo,
      rightMetadata: normalize(hero.querySelector(".pillar-right").textContent),
      surfaces: [
        hero.querySelector(".brand-mark__text"),
        hero.querySelector(".header-tagline"),
        hero.querySelector(".header-subheadline"),
        ...hero.querySelectorAll(".info-pillar, .info-pillar .label"),
      ].map(surface),
    };
  });

  expect(composition.desktopNavLinkColors).toEqual(Array(4).fill(navigationColor));
  expect(composition.photo.filter).toBe("grayscale(0.2) contrast(1.1)");
  expect(composition.photo.opacity).toBeCloseTo(1, 2);
  expect(composition.photo.scaleX).toBeCloseTo(1.07, 2);
  expect(composition.photo.scaleY).toBeCloseTo(1.07, 2);
  expect(composition.image.objectFit).toBe("cover");
  expect(["center", "50% 50%"]).toContain(composition.image.objectPosition);
  expect(composition.grainBackground).not.toBe("none");
  expect(
    composition.pseudo.filter(
      (layer) => layer.backgroundImage !== "none" || !layer.transparent,
    ),
    "Homepage hero must not paint a pseudo-element gradient or scrim",
  ).toEqual([]);
  expect(
    composition.surfaces.filter(
      (surface) =>
        !surface.transparent ||
        surface.borderRadius !== "0px" ||
        surface.borderWidths.some((width) => width !== 0) ||
        surface.boxShadow !== "none" ||
        surface.backdropFilter !== "none" ||
        surface.padding.some((value) => value !== 0),
    ),
    "Old-hero cobalt copy must remain transparent without backing cards, borders, blur, padding, or shadows",
  ).toEqual([]);
  expect(
    composition.surfaces.filter((surface) => surface.color !== "rgb(59, 65, 227)"),
    "Old-hero copy must retain the cobalt treatment",
  ).toEqual([]);
  expect(composition.leftMetadata).toBe(
    "Location Montreal, Quebec Enquiries hello@jq33.design +1 514 473 0075 Availability Now booking: Next 2-4 weeks Fast turnaround options (7-14 days)",
  );
  expect(composition.rightMetadata).toBe(
    "Headquarters 2727 Saint-Patrick St. Montreal, Quebec H3K 0A8 Status Cafes · Salons · Clinics · Boutiques · Offices Layout + finishes + 3D visuals to decide fast",
  );
});

test("homepage mark scale and subheadline measure match the old responsive hero", async ({ page }) => {
  for (const viewport of homeHeroViewports) {
    await page.setViewportSize(viewport);
    await gotoSettled(page, "/");

    const typography = await page.evaluate(() => {
      const mark = document.querySelector("#home .brand-mark__text");
      const markRotate = document.querySelector("#home .brand-mark__rotate");
      const subheadline = document.querySelector("#home .header-subheadline");
      const markStyle = getComputedStyle(mark);
      const subheadlineStyle = getComputedStyle(subheadline);
      const markRect = markRotate.getBoundingClientRect();
      const subheadlineRect = subheadline.getBoundingClientRect();
      const measure = document.createElement("span");
      measure.style.cssText = "position:fixed;visibility:hidden;pointer-events:none";
      measure.style.fontFamily = subheadlineStyle.fontFamily;
      measure.style.fontSize = subheadlineStyle.fontSize;
      measure.style.fontWeight = subheadlineStyle.fontWeight;
      measure.style.width = innerWidth <= 480
        ? "26ch"
        : innerWidth <= 768
          ? "min(84vw, 28ch)"
          : "min(80vw, 42ch)";
      document.body.append(measure);
      const expectedMaxWidth = measure.getBoundingClientRect().width;
      measure.remove();
      return {
        mark: {
          backgroundColor: markStyle.backgroundColor,
          borderRadius: markStyle.borderRadius,
          boxShadow: markStyle.boxShadow,
          centerX: markRect.left + markRect.width / 2,
          centerY: markRect.top + markRect.height / 2,
          color: markStyle.color,
          fontFamily: markStyle.fontFamily,
          fontSize: Number.parseFloat(markStyle.fontSize),
          fontWeight: markStyle.fontWeight,
          letterSpacing: Number.parseFloat(markStyle.letterSpacing),
          lineHeight: Number.parseFloat(markStyle.lineHeight),
          padding: [
            markStyle.paddingTop,
            markStyle.paddingRight,
            markStyle.paddingBottom,
            markStyle.paddingLeft,
          ].map(Number.parseFloat),
          textShadow: markStyle.textShadow,
          textTransform: markStyle.textTransform,
        },
        subheadline: {
          bottomGap: innerHeight - subheadlineRect.bottom,
          fontSize: Number.parseFloat(subheadlineStyle.fontSize),
          letterSpacing: Number.parseFloat(subheadlineStyle.letterSpacing),
          lineHeight: Number.parseFloat(subheadlineStyle.lineHeight),
          expectedMaxWidth,
          maxWidth: Number.parseFloat(subheadlineStyle.maxWidth),
          textAlign: subheadlineStyle.textAlign,
          textTransform: subheadlineStyle.textTransform,
          top: subheadlineRect.top,
        },
      };
    });

    const mobile = viewport.width <= 768;
    const compact = viewport.width <= 480;
    const expectedMarkFontSize = mobile
      ? Math.min(176, Math.max(45, viewport.height * 0.112))
      : Math.min(220, Math.max(56, viewport.height * 0.14));
    const expectedSubheadlineFontSize = compact ? 13.12 : mobile ? 14.4 : 16;
    const expectedSubheadlineLineHeight = compact ? 17.712 : mobile ? 19.44 : 20;
    const expectedSubheadlineLetterSpacing = compact ? 0.5248 : mobile ? 0.576 : 1;
    const label = `${viewport.width}x${viewport.height}`;

    expect(typography.mark.fontFamily, `Hero mark font must remain Permanent Marker at ${label}`).toContain(
      "Permanent Marker",
    );
    expect(typography.mark.fontSize, `Hero mark size must match the old scale at ${label}`).toBeCloseTo(
      expectedMarkFontSize,
      1,
    );
    expect(typography.mark.lineHeight, `Hero mark line height must match the old scale at ${label}`).toBeCloseTo(
      expectedMarkFontSize * 0.9,
      1,
    );
    expect(typography.mark.letterSpacing, `Hero mark tracking must match the old scale at ${label}`).toBeCloseTo(
      expectedMarkFontSize * 0.01,
      1,
    );
    expect(typography.mark.centerX, `Hero mark must stay horizontally centered at ${label}`).toBeCloseTo(
      viewport.width / 2,
      0,
    );
    expect(typography.mark.centerY, `Hero mark must stay vertically centered at ${label}`).toBeCloseTo(
      viewport.height / 2,
      0,
    );
    expect(typography.mark.color).toBe("rgb(59, 65, 227)");
    expect(typography.mark.fontWeight).toBe("400");
    expect(typography.mark.textTransform).toBe("none");
    expect(typography.mark.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(typography.mark.borderRadius).toBe("0px");
    expect(typography.mark.boxShadow).toBe("none");
    expect(typography.mark.padding).toEqual([0, 0, 0, 0]);
    expect(typography.mark.textShadow).toContain("20px");

    expect(typography.subheadline.maxWidth, `Subheadline measure must match the old breakpoint at ${label}`).toBeCloseTo(
      typography.subheadline.expectedMaxWidth,
      0,
    );
    expect(typography.subheadline.fontSize).toBeCloseTo(expectedSubheadlineFontSize, 1);
    expect(typography.subheadline.lineHeight).toBeCloseTo(expectedSubheadlineLineHeight, 1);
    expect(typography.subheadline.letterSpacing).toBeCloseTo(
      expectedSubheadlineLetterSpacing,
      1,
    );
    expect(typography.subheadline.textTransform).toBe("uppercase");
    expect(typography.subheadline.textAlign).toBe(mobile ? "left" : "center");
    if (compact) expect(typography.subheadline.top).toBeCloseTo(203.2, 0);
    else if (mobile) expect(typography.subheadline.top).toBeCloseTo(219.6, 0);
    else expect(typography.subheadline.bottomGap).toBeCloseTo(80, 0);
  }
});

test("critical route fonts use exact subsets without redundant requests", async ({ page }) => {
  const platformFontsFor = async (selectors) => {
    const cdp = await page.context().newCDPSession(page);
    await Promise.all([cdp.send("DOM.enable"), cdp.send("CSS.enable")]);
    const { root } = await cdp.send("DOM.getDocument");
    const proof = {};
    for (const selector of selectors) {
      const { nodeId } = await cdp.send("DOM.querySelector", {
        nodeId: root.nodeId,
        selector,
      });
      const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
      proof[selector] = fonts
        .filter(({ glyphCount }) => glyphCount > 0)
        .map(({ familyName, glyphCount }) => ({ familyName, glyphCount }));
    }
    await cdp.detach();
    return proof;
  };
  const expectPlatformFamily = (proof, selectors, expectedFamily) => {
    for (const selector of selectors) {
      expect(proof[selector], `${selector} must render at least one glyph`).not.toEqual([]);
      expect(
        proof[selector].filter(({ familyName }) => !expectedFamily.test(familyName)),
        `${selector} must not fall back outside ${expectedFamily}`,
      ).toEqual([]);
    }
  };
  const activateIntentFonts = async () => {
    await page.keyboard.press("Tab");
    await page.waitForFunction(() => {
      const stylesheet = document.querySelector('link[data-jq33-font-only]');
      return stylesheet instanceof HTMLLinkElement && Boolean(stylesheet.sheet);
    });
    return page.evaluate(async () => {
      const stylesheet = document.querySelector('link[data-jq33-font-only]');
      await document.fonts.load('900 16px "Lato"', "PROJECTS");
      await document.fonts.ready;
      const href = stylesheet.href;
      return {
        href,
        linkCount: document.querySelectorAll('link[data-jq33-font-only]').length,
        requestCount: performance
          .getEntriesByType("resource")
          .filter((entry) => entry.name === href).length,
        fullLatoLoaded: document.fonts.check('900 16px "Lato"', "PROJECTS"),
      };
    });
  };

  await gotoSettled(page, "/");
  const fontProof = await page.evaluate(async () => {
    await document.fonts.ready;
    const mark = document.querySelector("#brand-mark-text");
    const tagline = document.querySelector("#home .header-tagline");
    const fontRequests = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => url.includes("/assets/fonts/"));
    return {
      loaded: document.fonts.check('400 48px "Permanent Marker Home"', "JQ33 Design"),
      family: getComputedStyle(mark).fontFamily,
      externalRequests: fontRequests.filter((url) =>
        url.includes("permanent-marker-home.woff2"),
      ),
      interLoaded: document.fonts.check(
        '700 16px "JQ33 Home Inter"',
        "COMMERCIAL INTERIOR DESIGN MONTREAL",
      ),
      interFamily: getComputedStyle(tagline).fontFamily,
      homeInterRequests: fontRequests.filter((url) => url.includes("inter-home-hero.woff2")),
      fullInterRequests: fontRequests.filter((url) =>
        url.includes("inter-latin-400-900.woff2"),
      ),
      globalFontRequests: fontRequests.filter((url) =>
        /\/(?:lato-(?:400|700|900)|inter-latin-400-900|permanent-marker-400)\.woff2(?:[?#]|$)/.test(
          url,
        ),
      ),
      criticalLatoLoaded: document.fonts.check(
        '700 12px "JQ33 Home Critical Lato"',
        "JQ33 DESIGN Projects Journal Inquiry Contact",
      ),
      intentLoaderCount: document.querySelectorAll("script[data-jq33-font-intent]").length,
      fontOnlyLinkCount: document.querySelectorAll('link[data-jq33-font-only]').length,
    };
  });
  const homeInterSelectors = [
    "#home .header-tagline",
    "#home .header-subheadline",
    "#home .hero-action--primary",
    "#home .hero-action--secondary",
    "#home .pillar-left .label",
    "#home .pillar-right .label",
  ];
  const homeLatoSelectors = [".header-nav .label", ".header-nav .nav-link"];
  const platformFontProof = await platformFontsFor([
    ...homeInterSelectors,
    ...homeLatoSelectors,
  ]);

  expect(fontProof.loaded).toBe(true);
  expect(fontProof.family).toContain("Permanent Marker Home");
  expect(fontProof.externalRequests).toEqual([]);
  expect(fontProof.interLoaded).toBe(true);
  expect(fontProof.interFamily).toContain("JQ33 Home Inter");
  expect(fontProof.homeInterRequests).toHaveLength(1);
  expect(fontProof.fullInterRequests).toEqual([]);
  expect(fontProof.globalFontRequests).toEqual([]);
  expect(fontProof.criticalLatoLoaded).toBe(true);
  expect(fontProof.intentLoaderCount).toBe(1);
  expect(fontProof.fontOnlyLinkCount).toBe(0);
  expectPlatformFamily(platformFontProof, homeInterSelectors, /inter/i);
  expectPlatformFamily(platformFontProof, homeLatoSelectors, /lato/i);

  const homeActivation = await activateIntentFonts();
  expect(homeActivation.href).toMatch(/\/assets\/generated\/[a-f0-9]{64}\.css$/);
  expect(homeActivation.linkCount).toBe(1);
  expect(homeActivation.requestCount).toBe(1);
  expect(homeActivation.fullLatoLoaded).toBe(true);
  await page.keyboard.press("Shift");
  expect(await page.locator('link[data-jq33-font-only]').count()).toBe(1);

  await gotoSettled(page, "/commercial-interior-design-montreal/");
  const commercialFontProof = await page.evaluate(async () => {
    await document.fonts.ready;
    const heading = document.querySelector("main h1");
    return {
      loaded: document.fonts.check(
        '400 48px "Permanent Marker Commercial H1"',
        "Commercial Interior Design in Montreal",
      ),
      family: getComputedStyle(heading).fontFamily,
      externalRequests: performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((url) => url.includes("permanent-marker-commercial-h1.woff2")),
      globalFontRequests: performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((url) =>
          /\/(?:lato-(?:400|700|900)|inter-latin-400-900|permanent-marker-400)\.woff2(?:[?#]|$)/.test(
            url,
          ),
        ),
      criticalLato400Loaded: document.fonts.check(
        '400 16px "JQ33 Commercial Critical Lato"',
        "Commercial Interior Design Montreal Layout first interiors",
      ),
      criticalLato700Loaded: document.fonts.check(
        '700 16px "JQ33 Commercial Critical Lato"',
        "JQ33 DESIGN Book a call Get a free quote Projects Journal Inquiry Contact",
      ),
      intentLoaderCount: document.querySelectorAll("script[data-jq33-font-intent]").length,
      fontOnlyLinkCount: document.querySelectorAll('link[data-jq33-font-only]').length,
    };
  });

  const commercialLatoSelectors = [
    ".header-nav .label",
    ".header-nav .nav-link",
    "main .hero .hero-label",
    "main .hero .hero-lead",
    "main .hero .btn-primary",
    "main .hero .btn-secondary",
  ];
  const commercialMarkerSelectors = ["main .hero h1"];
  const commercialPlatformFontProof = await platformFontsFor([
    ...commercialLatoSelectors,
    ...commercialMarkerSelectors,
  ]);

  expect(commercialFontProof.loaded).toBe(true);
  expect(commercialFontProof.family).toContain("Permanent Marker Commercial H1");
  expect(commercialFontProof.externalRequests).toEqual([]);
  expect(commercialFontProof.globalFontRequests).toEqual([]);
  expect(commercialFontProof.criticalLato400Loaded).toBe(true);
  expect(commercialFontProof.criticalLato700Loaded).toBe(true);
  expect(commercialFontProof.intentLoaderCount).toBe(1);
  expect(commercialFontProof.fontOnlyLinkCount).toBe(0);
  expectPlatformFamily(commercialPlatformFontProof, commercialLatoSelectors, /lato/i);
  expectPlatformFamily(commercialPlatformFontProof, commercialMarkerSelectors, /permanent marker/i);

  const commercialActivation = await activateIntentFonts();
  expect(commercialActivation.href).toBe(homeActivation.href);
  expect(commercialActivation.linkCount).toBe(1);
  expect(commercialActivation.requestCount).toBe(1);
  expect(commercialActivation.fullLatoLoaded).toBe(true);
  await page.keyboard.press("Shift");
  expect(await page.locator('link[data-jq33-font-only]').count()).toBe(1);
});

test("homepage hero links preserve behavior and stay square in every supported state", async ({
  page,
}) => {
  for (const viewport of homeHeroViewports) {
    await page.setViewportSize(viewport);
    await gotoSettled(page, "/");

    const primary = page.locator("#home .hero-action--primary");
    const secondary = page.locator("#home .hero-action--secondary");
    await expect(primary).toHaveCount(1);
    await expect(secondary).toHaveCount(1);
    await expect(primary).toBeVisible();
    await expect(secondary).toBeVisible();

    const primaryContract = await primary.evaluate((element) => ({
      hook: element.hasAttribute("data-calendly-cta"),
      href: element.href,
      rel: element.rel.split(/\s+/).filter(Boolean),
      target: element.target,
    }));
    const secondaryUrl = new URL(await secondary.getAttribute("href"), page.url());
    expect(new URL(primaryContract.href).hostname).toMatch(/^(?:www\.)?calendly\.com$/);
    expect(primaryContract.hook).toBe(true);
    expect(primaryContract.target).toBe("_blank");
    expect(primaryContract.rel).toEqual(expect.arrayContaining(["noopener", "noreferrer"]));
    expect(secondaryUrl.pathname).toBe("/projects/");

    const client = await page.context().newCDPSession(page);
    await client.send("DOM.enable");
    await client.send("CSS.enable");
    const { root } = await client.send("DOM.getDocument");
    for (const [selector, locator] of [
      ["#home .hero-action--primary", primary],
      ["#home .hero-action--secondary", secondary],
    ]) {
      const { nodeId } = await client.send("DOM.querySelector", {
        nodeId: root.nodeId,
        selector,
      });
      expect(nodeId, `${selector} must resolve through the browser DOM`).toBeGreaterThan(0);
      const radii = {
        default: await locator.evaluate((element) => getComputedStyle(element).borderRadius),
      };
      for (const pseudo of ["hover", "focus-visible", "active", "visited"]) {
        await client.send("CSS.forcePseudoState", {
          forcedPseudoClasses: [pseudo],
          nodeId,
        });
        radii[pseudo] = await locator.evaluate((element) => getComputedStyle(element).borderRadius);
      }
      await client.send("CSS.forcePseudoState", { forcedPseudoClasses: [], nodeId });
      await locator.evaluate((element) => element.setAttribute("aria-disabled", "true"));
      radii.ariaDisabled = await locator.evaluate((element) => getComputedStyle(element).borderRadius);
      await locator.evaluate((element) => element.removeAttribute("aria-disabled"));
      expect(
        Object.entries(radii).filter(([, radius]) => radius !== "0px"),
        `${selector} must stay square in every state at ${viewport.width}x${viewport.height}`,
      ).toEqual([]);
    }
    await client.detach();
  }
});

test("approved visual taxonomy computes to 30px containers, 20px cards, and a square hero", async ({
  page,
}) => {
  const cases = [
    { route: "/inquiry/", selector: "#inquiry-name", radius: "30px" },
    { route: "/inquiry/", selector: ".site-footer .info-pillar", radius: "0px" },
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

import { expect, test } from "@playwright/test";
import { normalizeProviderEndpoint } from "./helpers/forms.mjs";

test.use({ javaScriptEnabled: false });

const nativePostCases = [
  {
    route: "/contact/",
    formType: "contact",
    values: {
      name: "Native Contact QA",
      email: "native-contact@example.test",
      project_type: "small-office",
      message: "No-JavaScript contact submission proof.",
    },
    hidden: {
      form_type: "contact",
      source_path: "/contact/",
      _subject: "JQ33 Contact request",
      _gotcha: "",
    },
  },
  {
    route: "/inquiry/",
    formType: "inquiry",
    values: {
      name_business: "Native Inquiry QA Studio",
      email: "native-inquiry@example.test",
      space_type: "Retail boutique",
      project_goals: "No-JavaScript inquiry submission proof.",
    },
    hidden: {
      form_type: "inquiry",
      source_path: "/inquiry/",
      _subject: "JQ33 Inquiry request",
      _gotcha: "",
    },
  },
];

test("Contact and Inquiry make distinct, single native POSTs with JavaScript disabled", async ({
  page,
}, testInfo) => {
  const captured = [];
  await page.route("https://formspree.io/**", async (intercepted) => {
    const request = intercepted.request();
    captured.push({
      method: request.method(),
      url: request.url(),
      headers: request.headers(),
      body: request.postData(),
    });
    await intercepted.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><html lang='en'><title>Native form fixture accepted</title><h1>Accepted</h1></html>",
    });
  });

  const actions = [];
  for (const nativeCase of nativePostCases) {
    const response = await page.goto(nativeCase.route, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const form = page.locator(`form[data-lead-form="${nativeCase.formType}"]`);
    await expect(form).toHaveAttribute("method", /post/i);
    const action = await form.getAttribute("action");
    expect(action).toBeTruthy();
    const normalizedAction = normalizeProviderEndpoint(
      action,
      `${nativeCase.route} native form action`,
    );
    actions.push(normalizedAction);

    for (const [name, value] of Object.entries(nativeCase.values)) {
      const control = form.locator(`[name="${name}"]`);
      if ((await control.evaluate((element) => element.tagName)) === "SELECT") {
        await control.selectOption(value);
      } else {
        await control.fill(value);
      }
    }

    const before = captured.length;
    await Promise.all([
      page.waitForURL(normalizedAction, { waitUntil: "domcontentloaded" }),
      form.locator('[type="submit"]').click(),
    ]);
    expect(
      captured.length - before,
      `${nativeCase.route} must issue exactly one native form request`,
    ).toBe(1);

    const request = captured.at(-1);
    expect(request.method).toBe("POST");
    expect(request.url).toBe(normalizedAction);
    expect(request.headers["content-type"]).toMatch(
      /^application\/x-www-form-urlencoded(?:;|$)/i,
    );
    const body = new URLSearchParams(request.body || "");
    for (const [name, value] of Object.entries({
      ...nativeCase.hidden,
      ...nativeCase.values,
    })) {
      expect(body.getAll(name), `${nativeCase.route} must POST one ${name} value`).toEqual([
        value,
      ]);
    }
  }

  expect(
    new URL(actions[0]).pathname,
    "Contact and Inquiry must not share a provider action path",
  ).not.toBe(new URL(actions[1]).pathname);
  expect(captured).toHaveLength(2);
  await testInfo.attach("no-js-native-post-contract", {
    body: Buffer.from(
      JSON.stringify(
        captured.map((request) => ({
          method: request.method,
          url: request.url,
          contentType: request.headers["content-type"],
          fields: Object.fromEntries(new URLSearchParams(request.body || "")),
        })),
        null,
        2,
      ),
    ),
    contentType: "application/json",
  });
});

import { expect, test } from "@playwright/test";
import { gotoSettled } from "./helpers/browser.mjs";
import {
  captureProviderRequest,
  expectEnhancedRequestBoundToForm,
  formDataEntries,
  normalizeProviderEndpoint,
} from "./helpers/forms.mjs";

const formRoutes = ["/contact/", "/inquiry/"];
const scenarios = [
  { name: "success", status: 200, body: { ok: true }, success: true },
  {
    name: "validation failure",
    status: 422,
    body: { errors: [{ field: "email", message: "Please use a valid email address." }] },
  },
  { name: "rate limit", status: 429, body: { errors: [] } },
  { name: "provider error", status: 500, body: { errors: [] } },
  { name: "network failure", abort: "failed" },
  { name: "timeout", timeout: true },
];

async function fillForm(form) {
  const controls = form.locator(
    "input:not([type='hidden']):not([type='submit']):not([name='_gotcha']), textarea, select",
  );
  const values = {};
  for (let index = 0; index < (await controls.count()); index += 1) {
    const control = controls.nth(index);
    const name = await control.getAttribute("name");
    const tag = await control.evaluate((element) => element.tagName.toLowerCase());
    const type = ((await control.getAttribute("type")) || "text").toLowerCase();
    if (!name) continue;
    if (tag === "select") {
      const option = control.locator("option:not([disabled])").filter({ hasNotText: /^$/ }).first();
      const value = await option.getAttribute("value");
      if (value) {
        await control.selectOption(value);
        values[name] = value;
      }
    } else if (["checkbox", "radio"].includes(type)) {
      await control.check();
      values[name] = await control.getAttribute("value");
    } else {
      const value =
        type === "email"
          ? "qa-browser@example.test"
          : type === "tel"
            ? "5145550100"
            : tag === "textarea"
              ? "QA browser submission with enough project detail for the form contract."
              : `QA ${name}`;
      await control.fill(value);
      values[name] = value;
    }
  }
  return values;
}

async function currentValues(form, names) {
  const values = {};
  for (const name of Object.keys(names)) {
    values[name] = await form.locator(`[name="${name}"]`).inputValue();
  }
  return values;
}

test("Contact and Inquiry use distinct normalized Formspree endpoints", async ({ page }) => {
  const endpoints = [];
  for (const route of formRoutes) {
    await gotoSettled(page, route);
    const form = page.locator("form[data-lead-form]");
    await expect(form).toHaveAttribute("data-enhanced", "true");
    await expect(form).toHaveAttribute("method", /post/i);
    endpoints.push(
      normalizeProviderEndpoint(
        await form.getAttribute("action"),
        `${route} provider endpoint`,
      ),
    );
  }

  expect(new URL(endpoints[0]).pathname, "Contact and Inquiry need separate lead queues").not.toBe(
    new URL(endpoints[1]).pathname,
  );
});

for (const route of formRoutes) {
  for (const scenario of scenarios) {
    test(`${route} handles Formspree ${scenario.name} with one request`, async ({ page }) => {
      if (scenario.timeout) {
        await page.addInitScript(() => {
          const nativeSetTimeout = window.setTimeout.bind(window);
          window.setTimeout = (callback, delay = 0, ...args) =>
            nativeSetTimeout(callback, delay >= 1000 ? 100 : delay, ...args);
        });
      }

      const requests = [];
      await page.route("https://formspree.io/**", async (intercepted) => {
        requests.push(captureProviderRequest(intercepted.request()));
        if (scenario.timeout) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          try {
            await intercepted.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ ok: true }),
            });
          } catch {
            // The browser is expected to cancel the timed-out request.
          }
        } else if (scenario.abort) {
          await intercepted.abort(scenario.abort);
        } else {
          await intercepted.fulfill({
            status: scenario.status,
            contentType: "application/json",
            body: JSON.stringify(scenario.body),
          });
        }
      });

      await gotoSettled(page, route);
      const form = page.locator("form[data-lead-form]");
      const original = await fillForm(form);
      const formAction = await form.getAttribute("action");
      const expectedEntries = await formDataEntries(form);

      await form.evaluate((element) => {
        element.requestSubmit();
        element.requestSubmit();
      });

      const status = form.locator("[data-form-status]");
      await expect(status).toHaveAttribute(
        "data-state",
        scenario.success ? "success" : "error",
      );
      expect(requests, "Double activation must create exactly one request").toHaveLength(1);
      expectEnhancedRequestBoundToForm({
        request: requests[0],
        formAction,
        expectedEntries,
        label: `${route} ${scenario.name}`,
      });

      if (scenario.success) {
        await expect(status).toContainText(/sent|thank|success/i);
        const values = await currentValues(form, original);
        expect(Object.values(values).every((value) => value === "")).toBe(true);
        await expect(form.locator("[data-form-retry]")).toBeHidden();
      } else if (scenario.abort || scenario.timeout) {
        await expect(status).toContainText(/unknown|may already|could not be confirmed|prevent a duplicate/i);
        expect(await currentValues(form, original)).toEqual(original);
        await expect(form.locator("[data-form-retry]")).toBeHidden();
        await expect(form.locator('[type="submit"]')).toBeDisabled();
        await expect(form).toHaveAttribute("data-delivery-unknown", "true");
        await expect(form).not.toHaveAttribute("aria-busy", "true");

        await form.evaluate((element) => {
          element.requestSubmit();
          element.requestSubmit();
        });
        await page.waitForTimeout(100);
        expect(
          requests,
          "An outcome-unknown submission must be blocked from repeating in this page session",
        ).toHaveLength(1);
      } else {
        await expect(status).toContainText(/retry|try again|could not|too many/i);
        expect(await currentValues(form, original)).toEqual(original);
        await expect(form.locator("[data-form-retry]")).toBeVisible();
        await expect(form.locator('[type="submit"]')).toBeEnabled();
        await expect(form).not.toHaveAttribute("data-delivery-unknown", "true");
        await expect(form).not.toHaveAttribute("aria-busy", "true");
      }
    });
  }

  test(`${route} coalesces repeated Enter activation while a request is in flight`, async ({
    page,
  }) => {
    const requests = [];
    let releaseRequest;
    let markRequestStarted;
    const requestStarted = new Promise((resolve) => {
      markRequestStarted = resolve;
    });
    const requestReleased = new Promise((resolve) => {
      releaseRequest = resolve;
    });

    await page.route("https://formspree.io/**", async (intercepted) => {
      requests.push(captureProviderRequest(intercepted.request()));
      markRequestStarted();
      await requestReleased;
      await intercepted.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await gotoSettled(page, route);
    const form = page.locator("form[data-lead-form]");
    await fillForm(form);
    const formAction = await form.getAttribute("action");
    const expectedEntries = await formDataEntries(form);
    const email = form.locator('input[type="email"]');
    await email.focus();
    await page.keyboard.press("Enter");
    await requestStarted;
    await expect(form).toHaveAttribute("aria-busy", "true");
    await expect(form.locator('[type="submit"]')).toBeDisabled();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await email.focus();
      await page.keyboard.press("Enter");
    }
    await page.waitForTimeout(100);
    expect(requests, "Repeated Enter must not race a second provider request").toHaveLength(1);

    releaseRequest();
    await expect(form.locator("[data-form-status]")).toHaveAttribute(
      "data-state",
      "success",
    );
    expect(requests).toHaveLength(1);
    expectEnhancedRequestBoundToForm({
      request: requests[0],
      formAction,
      expectedEntries,
      label: `${route} in-flight Enter race`,
    });
  });

  test(`${route} coalesces double-Enter retry activation into one retry request`, async ({
    page,
  }) => {
    const requests = [];
    let releaseRetry;
    let markRetryStarted;
    const retryStarted = new Promise((resolve) => {
      markRetryStarted = resolve;
    });
    const retryReleased = new Promise((resolve) => {
      releaseRetry = resolve;
    });

    await page.route("https://formspree.io/**", async (intercepted) => {
      requests.push(captureProviderRequest(intercepted.request()));
      if (requests.length === 1) {
        await intercepted.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ errors: [] }),
        });
        return;
      }
      markRetryStarted();
      await retryReleased;
      await intercepted.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await gotoSettled(page, route);
    const form = page.locator("form[data-lead-form]");
    await fillForm(form);
    const formAction = await form.getAttribute("action");
    const expectedEntries = await formDataEntries(form);
    await form.locator('[type="submit"]').click();
    const status = form.locator("[data-form-status]");
    const retry = form.locator("[data-form-retry]");
    await expect(status).toHaveAttribute("data-state", "error");
    await expect(retry).toBeVisible();

    await retry.focus();
    await page.keyboard.press("Enter");
    await retryStarted;
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
    expect(requests, "Repeated retry activation must add exactly one request").toHaveLength(2);

    releaseRetry();
    await expect(status).toHaveAttribute("data-state", "success");
    expect(requests).toHaveLength(2);
    const firstSubmissionId = expectEnhancedRequestBoundToForm({
      request: requests[0],
      formAction,
      expectedEntries,
      label: `${route} first provider-confirmed failure`,
    });
    const retrySubmissionId = expectEnhancedRequestBoundToForm({
      request: requests[1],
      formAction,
      expectedEntries,
      label: `${route} provider-confirmed retry`,
    });
    expect(
      retrySubmissionId,
      "A safe provider-confirmed retry must preserve the original idempotency tag",
    ).toBe(firstSubmissionId);
    expect(
      requests[1].entries,
      "A safe provider-confirmed retry must preserve the exact request body",
    ).toEqual(requests[0].entries);
  });
}

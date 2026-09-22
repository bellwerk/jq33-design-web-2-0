import { expect, test } from "@playwright/test";
import { gotoSettled } from "./helpers/browser.mjs";
import { captureProviderRequest } from "./helpers/forms.mjs";

const guides = [
  "/journal/commercial-interior-design-cost-montreal/",
  "/journal/before-you-sign-a-commercial-lease/",
  "/journal/salon-layout-planning-checklist/",
];

test("company introduction and contact purpose use the owner's facts", async ({ page }) => {
  await gotoSettled(page, "/contact/");
  await expect(page.locator("h1")).toContainText("Bold interiors");
  await expect(page.locator("h1")).toContainText("Eight years of experience");
  await expect(page.locator('form[data-lead-form="contact"] button[type="submit"]')).toHaveText("Send a message");
  await expect(page.locator('main a[href="/inquiry/"]').first()).toBeVisible();
});

test("journal has only published guides and each guide provides a next step", async ({ page }) => {
  await gotoSettled(page, "/journal/");
  await expect(page.locator("a.project-card")).toHaveCount(4);
  await expect(page.locator("div.project-card")).toHaveCount(0);
  for (const route of guides) {
    await gotoSettled(page, route);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator('main a[href="/inquiry/"]').first()).toBeVisible();
    expect((await page.locator("main").innerText()).split(/\s+/).length).toBeGreaterThan(250);
  }
});

test("checklist download contains practical content and stays outside the sitemap", async ({ request }) => {
  const file = "/assets/resources/commercial-lease-preparation-checklist.html";
  const response = await request.get(file);
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toMatch(/noindex/i);
  expect(html).toMatch(/landlord/i);
  expect(html).toMatch(/contractor/i);
  expect(html).toMatch(/print/i);
  expect((await (await request.get("/sitemap.xml")).text())).not.toContain(file);
});

test("campaign attribution survives navigation and accompanies accepted inquiries only as bounded fields", async ({ page }) => {
  const captured = [];
  await page.route("https://formspree.io/**", async (route) => {
    captured.push(captureProviderRequest(route.request()));
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  await gotoSettled(page, "/?utm_source=broker&utm_medium=referral&utm_campaign=september26&email=private@example.test");
  await gotoSettled(page, "/inquiry/");
  const form = page.locator('form[data-lead-form="inquiry"]');
  await form.locator('[name="name_business"]').fill("Synthetic Studio");
  await form.locator('[name="email"]').fill("synthetic@example.test");
  await form.locator('[name="space_type"]').selectOption("Not sure yet");
  await form.locator('[name="project_goals"]').fill("Discuss a small commercial space and a first layout.");
  const stored = await page.evaluate(() => sessionStorage.getItem("jq33-acquisition-v1"));
  expect(stored).not.toMatch(/@|private|Synthetic Studio|Discuss a small/);
  await form.locator('button[type="submit"]').click();
  await expect(form.locator('[data-form-status]')).toHaveAttribute("data-state", "success");
  expect(captured).toHaveLength(1);
  const fields = Object.fromEntries(captured[0].entries);
  expect(fields).toMatchObject({ utm_source: "broker", utm_medium: "referral", utm_campaign: "september26", landing_path: "/" });
  expect(fields).not.toHaveProperty("booking_completed");
  await expect(form.locator('[name="utm_source"]')).toHaveValue("broker");
  await expect(form.locator('[name="name_business"]')).toHaveValue("");
});

test("invalid campaign values and unavailable storage do not break form enhancement", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "sessionStorage", { get() { throw new Error("blocked storage"); } }));
  await gotoSettled(page, "/inquiry/?utm_source=person%40example.com&utm_campaign=" + "x".repeat(100));
  const form = page.locator("form[data-lead-form]");
  await expect(form).toHaveAttribute("data-enhanced", "true");
  await expect(form.locator('[name="utm_source"]')).toHaveValue("");
  await expect(form.locator('[name="utm_campaign"]')).toHaveValue("");
  await expect(form.locator('[name="landing_path"]')).toHaveValue("/inquiry/");
});

test("planning resources stay useful without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${test.info().project.use.baseURL}/planning-resources/`);
  await expect(page.locator("#sample-package")).toContainText(/illustrative/i);
  await expect(page.locator("#package-guide")).toContainText("Layout Sprint");
  await expect(page.locator('a[download]')).toHaveAttribute("href", "/assets/resources/commercial-lease-preparation-checklist.html");
  await context.close();
});

test("package guide explains all three recommendations and links to project intake", async ({ page }) => {
  await gotoSettled(page, "/planning-resources/");
  const tool = page.locator("[data-package-tool]");
  await expect(tool).toBeVisible();
  for (const [goal, title] of [["layout", "Layout Sprint"], ["concept", "Signature Interior"], ["handoff", "Contractor-Ready Package"]]) {
    await tool.locator(`input[value="${goal}"]`).check();
    await tool.locator("button").click();
    await expect(page.locator("[data-package-result]")).toContainText(title);
    expect((await page.locator("[data-package-result] p").innerText()).length).toBeGreaterThan(80);
    await expect(page.locator('[data-package-result] a')).toHaveAttribute("href", "/inquiry/");
  }
});

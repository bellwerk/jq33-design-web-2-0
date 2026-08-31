import fs from "node:fs";
import path from "node:path";
import {
  elements,
  getAttribute,
  hasAttribute,
  reportFailures,
  requireDirectory,
  resolveDistRoot,
  tags,
} from "../tests/helpers/site.mjs";

const distRoot = resolveDistRoot();
const failures = [];
const forms = [];

try {
  requireDirectory(distRoot, "Distribution directory");

  for (const name of ["contact", "inquiry"]) {
    const relativePath = `${name}/index.html`;
    const html = fs.readFileSync(path.join(distRoot, relativePath), "utf8");
    const matches = elements(html, "form").filter(
      ({ tag }) => getAttribute(tag, "data-lead-form") === name,
    );
    if (matches.length !== 1) {
      failures.push(`${relativePath} must contain exactly one data-lead-form="${name}" form.`);
      continue;
    }

    const form = matches[0];
    const action = getAttribute(form.tag, "action");
    const method = getAttribute(form.tag, "method").toLowerCase();
    if (method !== "post") failures.push(`${relativePath} form method must be POST.`);
    if (!/^https:\/\/formspree\.io\/f\/[A-Za-z0-9_-]{6,}\/?$/.test(action)) {
      failures.push(`${relativePath} form action is not a direct production Formspree endpoint.`);
    }
    if (/{{|}}|example|placeholder|your[-_]?form|FORM_ID/i.test(action)) {
      failures.push(`${relativePath} form action contains a placeholder.`);
    }
    if (hasAttribute(form.tag, "novalidate")) {
      failures.push(`${relativePath} disables native validation in static HTML.`);
    }

    const controlTags = [
      ...tags(form.source, "input"),
      ...tags(form.source, "select"),
      ...tags(form.source, "textarea"),
    ];
    const labels = tags(form.source, "label");
    const ids = new Set();
    for (const control of controlTags) {
      const type = (getAttribute(control, "type") || "text").toLowerCase();
      const controlName = getAttribute(control, "name");
      const id = getAttribute(control, "id");
      const isSelect = /^<select\b/i.test(control);
      const isTextarea = /^<textarea\b/i.test(control);
      if (id) {
        if (ids.has(id)) failures.push(`${relativePath} repeats form control id "${id}".`);
        ids.add(id);
      }
      if (["hidden", "submit", "button", "reset"].includes(type) || controlName === "_gotcha") {
        continue;
      }
      if (!id || !labels.some((label) => getAttribute(label, "for") === id)) {
        failures.push(`${relativePath} control "${controlName || id || "(unnamed)"}" lacks a persistent associated label.`);
      }
      if (!controlName) failures.push(`${relativePath} visible control "${id || "(unnamed)"}" lacks a name.`);
      if (
        !isSelect &&
        (["text", "email", "tel", "url"].includes(type) || isTextarea)
      ) {
        const maximum = Number(getAttribute(control, "maxlength"));
        if (!Number.isInteger(maximum) || maximum < 1 || maximum > 5000) {
          failures.push(`${relativePath} control "${controlName}" needs a finite maxlength.`);
        }
      }
    }

    const email = controlTags.find(
      (tag) => getAttribute(tag, "type").toLowerCase() === "email",
    );
    if (!email || !hasAttribute(email, "required")) {
      failures.push(`${relativePath} requires a required email control.`);
    }

    const honeypot = controlTags.find((tag) => getAttribute(tag, "name") === "_gotcha");
    if (
      !honeypot ||
      getAttribute(honeypot, "tabindex") !== "-1" ||
      getAttribute(honeypot, "autocomplete").toLowerCase() !== "off"
    ) {
      failures.push(`${relativePath} needs a keyboard-inert Formspree _gotcha honeypot.`);
    }
    if (!honeypot || !/hp-field|display\s*:\s*none|position\s*:\s*absolute/i.test(form.source)) {
      failures.push(`${relativePath} honeypot is not placed in a hidden/off-screen container.`);
    }

    const expectedTags = {
      form_type: name,
      source_path: `/${name}/`,
      _subject: "",
    };
    for (const [tagName, exactValue] of Object.entries(expectedTags)) {
      const fields = controlTags.filter(
        (tag) =>
          getAttribute(tag, "type").toLowerCase() === "hidden" &&
          getAttribute(tag, "name") === tagName,
      );
      if (fields.length !== 1) {
        failures.push(`${relativePath} must contain exactly one hidden "${tagName}" tag.`);
      } else if (
        exactValue &&
        getAttribute(fields[0], "value") !== exactValue
      ) {
        failures.push(`${relativePath} hidden "${tagName}" tag has the wrong value.`);
      } else if (!getAttribute(fields[0], "value").trim()) {
        failures.push(`${relativePath} hidden "${tagName}" tag must not be empty.`);
      }
    }

    const status = tags(form.source, "p").find((tag) =>
      hasAttribute(tag, "data-form-status"),
    ) || tags(form.source, "div").find((tag) => hasAttribute(tag, "data-form-status"));
    if (
      !status ||
      getAttribute(status, "role").toLowerCase() !== "status" ||
      getAttribute(status, "aria-live").toLowerCase() !== "polite" ||
      getAttribute(status, "aria-atomic").toLowerCase() !== "true"
    ) {
      failures.push(`${relativePath} needs an atomic polite aria-live status region.`);
    }
    const retry = tags(form.source, "button").find((tag) =>
      hasAttribute(tag, "data-form-retry"),
    );
    if (
      !retry ||
      getAttribute(retry, "type").toLowerCase() !== "button" ||
      !hasAttribute(retry, "hidden")
    ) {
      failures.push(`${relativePath} needs an initially hidden, non-submit retry button.`);
    }

    forms.push({ name, action, relativePath });
  }

  if (forms.length === 2 && forms[0].action === forms[1].action) {
    failures.push("Contact and Inquiry must use distinct Formspree endpoints.");
  }

  const leadsPath = path.join(distRoot, "assets", "js", "leads.js");
  if (!fs.existsSync(leadsPath)) {
    failures.push("Enhanced form runtime is missing: assets/js/leads.js.");
  } else {
    const source = fs.readFileSync(leadsPath, "utf8");
    const contracts = [
      [/\bfetch\s*\(\s*form\.action\b/, "enhanced fetch must use the native form action"],
      [/method\s*:\s*["']POST["']/i, "enhanced request must use POST"],
      [/new\s+FormData\s*\(\s*form\s*\)/, "enhanced request must submit FormData"],
      [/AbortController/, "enhanced request needs an AbortController"],
      [/(?:REQUEST_TIMEOUT|setTimeout)[\s\S]{0,250}(?:abort|REQUEST_TIMEOUT)/, "enhanced request needs a finite timeout"],
      [/dataset\.submitting\s*===\s*["']true["']/, "enhanced flow needs an in-flight lock"],
      [/submitControl\.disabled\s*=\s*true/, "enhanced flow must disable submit while pending"],
      [/response\.ok/, "enhanced flow must confirm a successful HTTP response"],
      [/response\.status\s*===\s*429/, "enhanced flow must handle rate limiting"],
      [/form\.reset\s*\(\s*\)/, "enhanced flow must reset after success"],
      [/data-form-retry|requestSubmit/, "enhanced flow must implement retry"],
      [/input\[name=["']submission_id["']\]|name\s*=\s*["']submission_id["']/, "enhanced flow needs a stable per-attempt submission identifier"],
      [/dataset\.deliveryUnknown/, "enhanced flow must record ambiguous delivery outcomes"],
      [/may already have been accepted|before delivery could be confirmed/i, "enhanced flow must describe ambiguous delivery without claiming failure"],
      [/prevent a duplicate[^]*do not resend/i, "enhanced flow must block ambiguous-outcome resubmission"],
      [/submitControl\.disabled\s*=\s*form\.dataset\.deliveryUnknown\s*===\s*["']true["']/, "enhanced flow must keep submit disabled when delivery is unknown"],
      [/aria-busy/, "enhanced flow must expose busy state"],
      [/(?:timed out|timeout)/i, "enhanced flow must announce timeout"],
      [/(?:entries are still here|preserv)/i, "enhanced flow must communicate value preservation"],
      [/addEventListener\s*\(\s*["']submit["']/, "enhanced flow must bind submit once"],
      [/dataset\.enhanced/, "enhanced flow needs repeated-binding protection"],
    ];
    for (const [pattern, message] of contracts) {
      if (!pattern.test(source)) failures.push(`assets/js/leads.js: ${message}.`);
    }
    if (/\bfetch\s*\(\s*["'`](?:https?:)?\/\//.test(source)) {
      failures.push("assets/js/leads.js hard-codes an enhanced endpoint instead of form.action.");
    }
    if (/supabase|lead-intake|\/functions\//i.test(source)) {
      failures.push("assets/js/leads.js contains a dead backend/CRM submission path.");
    }

    const providerErrorIndex = source.indexOf("error instanceof SubmissionError");
    const retryVisibleIndex = source.indexOf("setRetryVisible(form, true)");
    const abortErrorIndex = source.indexOf('error?.name === "AbortError"');
    if (
      providerErrorIndex === -1 ||
      retryVisibleIndex < providerErrorIndex ||
      (abortErrorIndex !== -1 && retryVisibleIndex > abortErrorIndex)
    ) {
      failures.push(
        "assets/js/leads.js may expose Retry only for a provider-confirmed rejection, never an ambiguous timeout/network outcome.",
      );
    }

    const resetIndex = source.indexOf("form.reset()");
    const successGuardIndex = source.indexOf("await submitToFormspree");
    const catchIndex = source.indexOf("catch", successGuardIndex);
    if (
      resetIndex === -1 ||
      successGuardIndex === -1 ||
      resetIndex < successGuardIndex ||
      (catchIndex !== -1 && resetIndex > catchIndex)
    ) {
      failures.push("assets/js/leads.js must reset values only after confirmed provider success.");
    }
  }
} catch (error) {
  failures.push(error.message);
}

reportFailures("Form contract validation", failures, "Form contract validation passed.");

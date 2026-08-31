(() => {
  "use strict";

  const FORM_SELECTOR = "form[data-lead-form]";
  const REQUEST_TIMEOUT_MS = 10_000;

  class SubmissionError extends Error {
    constructor(message, fieldErrors = []) {
      super(message);
      this.name = "SubmissionError";
      this.fieldErrors = fieldErrors;
    }
  }

  const getSubmitControl = (form) =>
    form.querySelector('button[type="submit"], input[type="submit"]');

  const getStatusNode = (form) => form.querySelector("[data-form-status]");
  const getRetryControl = (form) => form.querySelector("[data-form-retry]");

  const ensureSubmissionId = (form) => {
    let field = form.querySelector('input[name="submission_id"]');
    if (!(field instanceof HTMLInputElement)) {
      field = document.createElement("input");
      field.type = "hidden";
      field.name = "submission_id";
      form.appendChild(field);
    }
    if (!field.value) {
      if (typeof globalThis.crypto?.randomUUID === "function") {
        field.value = globalThis.crypto.randomUUID();
      } else {
        const bytes = new Uint8Array(16);
        globalThis.crypto.getRandomValues(bytes);
        field.value = [...bytes]
          .map((value) => value.toString(16).padStart(2, "0"))
          .join("");
      }
    }
    return field.value;
  };

  const setStatus = (form, state, message, focus = false) => {
    const statusNode = getStatusNode(form);
    if (!statusNode) return;

    statusNode.textContent = message;
    statusNode.dataset.state = state;
    statusNode.classList.toggle("is-error", state === "error");
    statusNode.classList.toggle("is-success", state === "success");

    if (focus && message) {
      statusNode.setAttribute("tabindex", "-1");
      statusNode.focus({ preventScroll: false });
    }
  };

  const setRetryVisible = (form, visible) => {
    const retry = getRetryControl(form);
    if (!(retry instanceof HTMLButtonElement)) return;
    retry.hidden = !visible;
  };

  const clearFieldError = (control) => {
    if (
      !(
        control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
      )
    ) {
      return;
    }

    control.removeAttribute("aria-invalid");
    const errorId = `${control.id || control.name}-error`;
    const error = document.getElementById(errorId);
    const isPersistentSlot = error?.hasAttribute("data-field-error");
    const describedBy = String(control.getAttribute("aria-describedby") || "")
      .split(/\s+/)
      .filter(Boolean);

    const nextDescribedBy = isPersistentSlot
      ? [...new Set([...describedBy, errorId])]
      : describedBy.filter((id) => id !== errorId);

    if (nextDescribedBy.length) {
      control.setAttribute("aria-describedby", nextDescribedBy.join(" "));
    } else {
      control.removeAttribute("aria-describedby");
    }

    if (isPersistentSlot) {
      error.textContent = "";
    } else {
      error?.remove();
    }
  };

  const showFieldError = (control, message) => {
    if (
      !(
        control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
      )
    ) {
      return;
    }

    clearFieldError(control);
    if (!control.id) return;

    const errorId = `${control.id}-error`;
    const existingError = document.getElementById(errorId);
    const error = existingError || document.createElement("p");
    if (!existingError) {
      error.className = "field-error";
      error.id = errorId;
      error.setAttribute("aria-live", "polite");
    }
    error.textContent = message;

    control.setAttribute("aria-invalid", "true");
    const describedBy = String(control.getAttribute("aria-describedby") || "")
      .split(/\s+/)
      .filter(Boolean);
    describedBy.push(errorId);
    control.setAttribute("aria-describedby", [...new Set(describedBy)].join(" "));

    if (!existingError) {
      control.insertAdjacentElement("afterend", error);
    }
  };

  const clearErrors = (form) => {
    const controls = form.querySelectorAll("input, select, textarea");
    for (const control of controls) clearFieldError(control);
  };

  const showNativeErrors = (form) => {
    clearErrors(form);
    const invalidControls = [
      ...form.querySelectorAll("input:invalid, select:invalid, textarea:invalid"),
    ].filter((control) => control.name !== "_gotcha");

    for (const control of invalidControls) {
      showFieldError(control, control.validationMessage);
    }

    if (invalidControls.length) {
      const count = invalidControls.length;
      setStatus(
        form,
        "error",
        `Please correct ${count} ${count === 1 ? "field" : "fields"} and try again.`,
        true,
      );
      invalidControls[0].focus();
      return false;
    }

    return true;
  };

  const parseProviderErrors = async (response) => {
    try {
      const payload = await response.json();
      if (!Array.isArray(payload?.errors)) return [];
      return payload.errors
        .map((entry) => ({
          field: String(entry?.field || "").trim(),
          message: String(entry?.message || "").trim(),
        }))
        .filter((entry) => entry.field && entry.message);
    } catch {
      return [];
    }
  };

  const submitToFormspree = async (form, signal) => {
    const response = await fetch(form.action, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new FormData(form),
      signal,
    });

    if (!response.ok) {
      const fieldErrors = await parseProviderErrors(response);
      throw new SubmissionError(
        response.status === 429
          ? "Too many attempts. Please wait a moment, then retry."
          : "We could not send your request. Please review the form and retry.",
        fieldErrors,
      );
    }
  };

  const applyProviderErrors = (form, errors) => {
    for (const error of errors) {
      const escapedName =
        typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? CSS.escape(error.field)
          : error.field.replace(/["\\]/g, "\\$&");
      const control = form.querySelector(`[name="${escapedName}"]`);
      if (control) showFieldError(control, error.message);
    }
  };

  const submitForm = async (form) => {
    if (form.dataset.submitting === "true") return;
    if (form.dataset.deliveryUnknown === "true") {
      setStatus(
        form,
        "error",
        "Delivery status is still unknown. To prevent a duplicate, do not resend this page-session request; keep these entries and email hello@jq33.design if you need confirmation.",
        true,
      );
      return;
    }

    if (!showNativeErrors(form)) {
      form.reportValidity();
      return;
    }

    clearErrors(form);
    setRetryVisible(form, false);
    ensureSubmissionId(form);
    form.dataset.submitting = "true";
    form.setAttribute("aria-busy", "true");

    const submitControl = getSubmitControl(form);
    if (submitControl) submitControl.disabled = true;

    setStatus(form, "loading", "Sending your request…");

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      await submitToFormspree(form, controller.signal);
      form.reset();
      const submissionIdField = form.querySelector('input[name="submission_id"]');
      if (submissionIdField instanceof HTMLInputElement) submissionIdField.value = "";
      delete form.dataset.deliveryUnknown;
      setStatus(
        form,
        "success",
        "Thanks—your request has been sent. We reply within one business day.",
        true,
      );
    } catch (error) {
      if (error instanceof SubmissionError) {
        applyProviderErrors(form, error.fieldErrors);
        setStatus(form, "error", error.message, true);
        setRetryVisible(form, true);
      } else if (error?.name === "AbortError") {
        form.dataset.deliveryUnknown = "true";
        setStatus(
          form,
          "error",
          "The request timed out and may already have been accepted. Your entries are still here; to prevent a duplicate, do not resend from this page. Email hello@jq33.design if you need confirmation.",
          true,
        );
      } else {
        form.dataset.deliveryUnknown = "true";
        setStatus(
          form,
          "error",
          "The connection ended before delivery could be confirmed. Your entries are still here; to prevent a duplicate, do not resend from this page. Email hello@jq33.design if you need confirmation.",
          true,
        );
      }
    } finally {
      window.clearTimeout(timeoutId);
      delete form.dataset.submitting;
      form.removeAttribute("aria-busy");
      if (submitControl) {
        submitControl.disabled = form.dataset.deliveryUnknown === "true";
      }
    }
  };

  const enhanceForm = (form) => {
    if (!(form instanceof HTMLFormElement) || form.dataset.enhanced === "true") {
      return;
    }

    form.dataset.enhanced = "true";
    form.noValidate = true;

    form.addEventListener("input", (event) => clearFieldError(event.target));
    form.addEventListener("change", (event) => clearFieldError(event.target));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void submitForm(form);
    });

    const retry = getRetryControl(form);
    if (retry instanceof HTMLButtonElement) {
      retry.addEventListener("click", () => {
        if (form.dataset.submitting === "true") return;
        form.requestSubmit();
      });
    }
  };

  const init = () => {
    const forms = document.querySelectorAll(FORM_SELECTOR);
    for (const form of forms) enhanceForm(form);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

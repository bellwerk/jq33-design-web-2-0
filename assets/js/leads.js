(() => {
  const FORM_SELECTOR = "form[data-lead-form]";
  const PLACEHOLDER_TOKEN = /your-anon-key|your-project/i;

  const setStatus = (statusNode, message, isError = false) => {
    if (!statusNode) return;
    statusNode.textContent = message;
    statusNode.classList.toggle("is-error", isError);
  };

  const getConfig = () => {
    const config = window.JQ33 || {};
    const supabaseUrl = config.SUPABASE_URL;
    const anonKey = config.SUPABASE_ANON_KEY;
    const functionUrl =
      config.LEAD_FUNCTION_URL || (supabaseUrl ? `${supabaseUrl}/functions/v1/lead-intake` : "");
    const formspreeContactUrl = config.FORMSPREE_CONTACT_URL;
    const formspreeInquiryUrl = config.FORMSPREE_INQUIRY_URL;

    return {
      supabaseUrl,
      anonKey,
      functionUrl,
      formspreeContactUrl,
      formspreeInquiryUrl,
      formFallbackEnabled: String(config.FORM_FALLBACK_ENABLED || "").toLowerCase() === "true"
    };
  };

  const isConfigured = (value) => Boolean(value && !PLACEHOLDER_TOKEN.test(value));

  const getFormspreeUrl = (formType, config) => {
    if (formType === "contact") return config.formspreeContactUrl;
    if (formType === "inquiry") return config.formspreeInquiryUrl;
    return "";
  };

  const buildPayload = (form) => {
    const formType = form.dataset.leadForm;
    const data = new FormData(form);
    const honeypotValue = String(data.get("_gotcha") || "").trim();

    if (honeypotValue) {
      return { honeypot: honeypotValue, form_type: formType };
    }

    const payload = {
      form_type: formType,
      source_path: window.location.pathname,
      user_agent: navigator.userAgent
    };

    if (formType === "contact") {
      payload.name = String(data.get("name") || "").trim();
      payload.email = String(data.get("email") || "").trim();
      payload.project_type = String(data.get("project_type") || "").trim();
      payload.message = String(data.get("message") || "").trim();
    }

    if (formType === "inquiry") {
      payload.name_business = String(data.get("name_business") || "").trim();
      payload.email = String(data.get("email") || "").trim();
      payload.space_type = String(data.get("space_type") || "").trim();
      payload.project_goals = String(data.get("project_goals") || "").trim();
    }

    return payload;
  };

  const submitFormspree = async (form, url) => {
    const data = new FormData(form);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json"
      },
      body: data
    });

    if (!response.ok) {
      throw new Error("Formspree request failed");
    }
  };

  const submitLead = async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) return;

    const formType = form.dataset.leadForm || "";
    const statusNode = form.querySelector("[data-form-status]");
    const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
    const config = getConfig();
    const formspreeUrl = getFormspreeUrl(formType, config);
    const hasFormspree = isConfigured(formspreeUrl);
    const hasSupabase =
      isConfigured(config.supabaseUrl) && isConfigured(config.anonKey) && config.functionUrl;

    if (!hasFormspree && !hasSupabase) {
      setStatus(
        statusNode,
        "Form is not configured yet. Add Supabase URL + anon key in assets/js/supabase-config.js.",
        true
      );
      return;
    }

    if (!form.reportValidity()) return;

    if (submitButton instanceof HTMLButtonElement || submitButton instanceof HTMLInputElement) {
      submitButton.disabled = true;
    }

    setStatus(statusNode, "Sending...");

    try {
      if (hasSupabase) {
        const payload = buildPayload(form);
        const response = await fetch(config.functionUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: config.anonKey,
            Authorization: `Bearer ${config.anonKey}`
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error("Lead intake request failed");
        }
      } else if (hasFormspree) {
        await submitFormspree(form, formspreeUrl);
      } else {
        throw new Error("No submission provider configured");
      }

      form.reset();
      setStatus(statusNode, "Thanks! Your message has been sent. We reply within 24 hours.");
    } catch {
      if (hasFormspree && config.formFallbackEnabled) {
        try {
          await submitFormspree(form, formspreeUrl);
          form.reset();
          setStatus(statusNode, "Thanks! Your message has been sent. We reply within 24 hours.");
          return;
        } catch {
          // Continue with shared error message below.
        }
      }

      setStatus(statusNode, "Could not send right now. Please try again or email hello@jq33.design.", true);
    } finally {
      if (submitButton instanceof HTMLButtonElement || submitButton instanceof HTMLInputElement) {
        submitButton.disabled = false;
      }
    }
  };

  const initLeadForms = () => {
    const forms = document.querySelectorAll(FORM_SELECTOR);
    for (const form of forms) {
      if (!(form instanceof HTMLFormElement)) continue;
      form.addEventListener("submit", submitLead);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLeadForms, { once: true });
  } else {
    initLeadForms();
  }
})();

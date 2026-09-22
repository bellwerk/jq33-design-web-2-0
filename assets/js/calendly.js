(() => {
  "use strict";

  window.JQ33 = window.JQ33 || {};

  /*
   * Replaced by the production build after strict validation. This remains an
   * ordinary outbound link: no Calendly widget, iframe, cookie, or network
   * request is created before the visitor activates it.
   */
  const calendlyUrl = "{{CALENDLY_URL}}";
  window.JQ33.CALENDLY_URL = calendlyUrl;

  // Session-only campaign attribution. Never retain raw URLs, arbitrary
  // referrers, personal form values, or advertising identifiers.
  const attributionKey = "jq33-acquisition-v1";
  const campaignValue = (value) =>
    /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(String(value || "")) ? value : "";
  const pagePath = () => {
    const canonical = document.querySelector('link[rel="canonical"]')?.href;
    try {
      const url = new URL(canonical || location.href);
      return /^\/(?:[a-z0-9-]+\/)*$/.test(url.pathname) ? url.pathname : "/";
    } catch {
      return "/";
    }
  };
  const referralGroup = () => {
    try {
      const host = new URL(document.referrer).hostname;
      if (host === location.hostname) return "internal";
      for (const domain of ["google.com", "google.ca", "bing.com", "linkedin.com", "instagram.com", "facebook.com"]) {
        if (host === domain || host.endsWith(`.${domain}`)) return domain;
      }
      return "external-referral";
    } catch {
      return "direct-or-unavailable";
    }
  };
  const params = new URLSearchParams(location.search);
  const freshAttribution = {
    utm_source: campaignValue(params.get("utm_source")),
    utm_medium: campaignValue(params.get("utm_medium")),
    utm_campaign: campaignValue(params.get("utm_campaign")),
    landing_path: pagePath(),
    referrer_group: referralGroup(),
  };
  let attribution = freshAttribution;
  try {
    const stored = JSON.parse(sessionStorage.getItem(attributionKey) || "null");
    if (stored && Date.now() - stored.savedAt >= 0 && Date.now() - stored.savedAt < 30 * 60 * 1000) {
      attribution = {
        utm_source: campaignValue(stored.utm_source),
        utm_medium: campaignValue(stored.utm_medium),
        utm_campaign: campaignValue(stored.utm_campaign),
        landing_path: /^\/(?:[a-z0-9-]+\/)*$/.test(stored.landing_path) ? stored.landing_path : pagePath(),
        referrer_group: ["google.com", "google.ca", "bing.com", "linkedin.com", "instagram.com", "facebook.com", "internal", "external-referral", "direct-or-unavailable"].includes(stored.referrer_group) ? stored.referrer_group : "direct-or-unavailable",
      };
    } else {
      sessionStorage.setItem(attributionKey, JSON.stringify({ ...attribution, savedAt: Date.now() }));
    }
  } catch {
    // Storage restrictions must never prevent a native link or inquiry.
  }
  const applyLeadAttribution = (form) => {
    for (const [name, value] of Object.entries(attribution)) {
      let field = form.querySelector(`input[name="${name}"]`);
      if (!field) {
        field = document.createElement("input");
        field.type = "hidden";
        field.name = name;
        form.appendChild(field);
      }
      field.value = value;
    }
  };
  window.JQ33.applyLeadAttribution = applyLeadAttribution;
  const tagForms = () => document.querySelectorAll("form[data-lead-form]").forEach(applyLeadAttribution);
  tagForms();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tagForms, { once: true });

  const syncLinks = (root = document) => {
    const links = root.querySelectorAll("[data-calendly-cta]");
    for (const link of links) {
      if (!(link instanceof HTMLAnchorElement)) continue;
      link.href = calendlyUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
  };

  syncLinks();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => syncLinks(), {
      once: true,
    });
  }

  window.JQ33.syncBookingLinks = syncLinks;
})();

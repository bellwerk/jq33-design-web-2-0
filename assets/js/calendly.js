(() => {
  window.JQ33 = window.JQ33 || {};

  const CALENDLY_URL = "https://calendly.com/hello-jq33/15min";
  const CTA_SELECTOR = "[data-calendly-cta]";
  const CALENDLY_SCRIPT_SRC = "https://assets.calendly.com/assets/external/widget.js";

  window.JQ33.CALENDLY_URL = CALENDLY_URL;

  const shouldUseDirectLink = () =>
    window.matchMedia("(max-width: 900px), (hover: none), (pointer: coarse)").matches;

  const syncCtaLinks = (root = document) => {
    const ctas = root.querySelectorAll(CTA_SELECTOR);
    for (const cta of ctas) {
      if (!(cta instanceof HTMLAnchorElement)) continue;
      cta.href = CALENDLY_URL;
      cta.target = "_blank";
      cta.rel = "noopener";
    }
  };

  let widgetPromise = null;
  const ensureWidgetLoaded = () => {
    if (window.Calendly?.initPopupWidget) return Promise.resolve();
    if (widgetPromise) return widgetPromise;

    widgetPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${CALENDLY_SCRIPT_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Calendly failed to load")), {
          once: true,
        });
        return;
      }

      const script = document.createElement("script");
      script.src = CALENDLY_SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Calendly failed to load"));
      document.head.appendChild(script);
    });

    return widgetPromise;
  };

  const openCalendlyPopup = async (event) => {
    const trigger =
      event.target instanceof Element ? event.target.closest(CTA_SELECTOR) : null;
    if (!(trigger instanceof HTMLAnchorElement)) return;
    if (shouldUseDirectLink()) return;

    event.preventDefault();
    try {
      await ensureWidgetLoaded();
      if (!window.Calendly?.initPopupWidget) {
        window.open(CALENDLY_URL, "_blank", "noopener");
        return;
      }
      window.Calendly.initPopupWidget({ url: CALENDLY_URL });
    } catch {
      window.open(CALENDLY_URL, "_blank", "noopener");
    }
  };

  syncCtaLinks();
  document.addEventListener("DOMContentLoaded", () => syncCtaLinks());
  document.addEventListener("click", openCalendlyPopup);
})();

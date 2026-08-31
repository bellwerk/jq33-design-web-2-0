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

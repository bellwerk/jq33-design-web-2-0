(() => {
  const bindSkipLinks = () => {
    const links = document.querySelectorAll(".skip-link[href^='#']");
    for (const link of links) {
      if (!(link instanceof HTMLAnchorElement) || link.dataset.skipBound === "true") {
        continue;
      }

      const targetSelector = link.getAttribute("href");
      if (!targetSelector || targetSelector === "#") continue;
      const target = document.querySelector(targetSelector);
      if (!(target instanceof HTMLElement)) continue;

      link.dataset.skipBound = "true";
      link.addEventListener("click", (event) => {
        event.preventDefault();
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.scrollIntoView({ behavior: "auto", block: "start" });
        target.focus({ preventScroll: true });
        history.replaceState(null, "", targetSelector);
      });
    }
  };

  const bindNav = () => {
    const toggle =
      document.querySelector("[data-nav-toggle]") ||
      document.querySelector(".nav-toggle");
    const overlay = document.querySelector("[data-nav-overlay]");
    const drawer = document.getElementById("site-nav-drawer");

    if (!(toggle instanceof HTMLButtonElement)) return false;
    if (!(overlay instanceof HTMLElement)) return false;
    if (!(drawer instanceof HTMLElement)) return false;
    if (toggle.dataset.navBound === "true") return true;

    toggle.dataset.navBound = "true";

    const isOpen = () => document.body.classList.contains("is-nav-open");

    const setA11y = (open) => {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      overlay.setAttribute("aria-hidden", open ? "false" : "true");
      drawer.setAttribute("aria-hidden", open ? "false" : "true");
      drawer.inert = !open;
    };

    let lastActive = null;

    const openNav = () => {
      if (isOpen()) return;
      lastActive =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      document.body.classList.add("is-nav-open");
      setA11y(true);

      const firstLink = drawer.querySelector("a, button");
      if (firstLink instanceof HTMLElement) firstLink.focus();
    };

    const closeNav = () => {
      if (!isOpen()) return;
      document.body.classList.remove("is-nav-open");
      setA11y(false);
      const target = lastActive || toggle;
      if (target instanceof HTMLElement) target.focus();
    };

    const toggleNav = () => {
      if (isOpen()) closeNav();
      else openNav();
    };

    setA11y(false);

    toggle.addEventListener("click", toggleNav);
    overlay.addEventListener("click", closeNav);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeNav();
        return;
      }

      if (e.key !== "Tab" || !isOpen()) return;

      const focusable = [
        ...drawer.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ),
      ].filter(
        (element) =>
          element instanceof HTMLElement &&
          !element.hidden &&
          element.getAttribute("aria-hidden") !== "true",
      );

      if (!focusable.length) {
        e.preventDefault();
        toggle.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    drawer.addEventListener("click", (e) => {
      const t = e.target instanceof Element ? e.target.closest("a") : null;
      if (!t) return;
      closeNav();
    });

    return true;
  };

  bindSkipLinks();

  if (bindNav()) return;

  const tryBind = () => {
    bindSkipLinks();
    return bindNav();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryBind, { once: true });
  } else {
    tryBind();
  }

  if (document.body) {
    const observer = new MutationObserver(() => {
      if (bindNav()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();

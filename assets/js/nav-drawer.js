(() => {
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
      if (e.key === "Escape") closeNav();
    });

    drawer.addEventListener("click", (e) => {
      const t = e.target instanceof Element ? e.target.closest("a") : null;
      if (!t) return;
      closeNav();
    });

    return true;
  };

  if (bindNav()) return;

  const tryBind = () => bindNav();

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


(() => {
  window.JQ33 = window.JQ33 || {};
  window.JQ33.components = window.JQ33.components || {};
  const calendlyUrl = window.JQ33.CALENDLY_URL || "/inquiry/";

  window.JQ33.components.headerNav = `
  <a href="/" class="nav-item" aria-label="JQ33 DESIGN Home">
    <img
      class="nav-logo"
      src="/assets/logo/logo purple svg.svg"
      alt="JQ33 DESIGN"
      decoding="async"
    />
    <div class="label">JQ33 DESIGN</div>
  </a>

  <nav aria-label="Primary">
    <ul class="nav-group">
      <li><a href="/projects/" class="nav-link">Projects</a></li>
      <li><a href="/journal/" class="nav-link">Journal</a></li>
      <li><a href="/inquiry/" class="nav-link">Inquiry</a></li>
      <li><a href="/contact/" class="nav-link">Contact</a></li>
    </ul>
  </nav>

  <button
    class="nav-toggle"
    type="button"
    aria-controls="site-nav-drawer"
    aria-expanded="false"
    aria-label="Open menu"
    data-nav-toggle
  >
    <span class="nav-toggle-bars" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
    </span>
  </button>
  `.trim();

  const ensureDrawer = () => {
    const hasOverlay = document.querySelector("[data-nav-overlay]");
    if (!hasOverlay) {
      const overlay = document.createElement("div");
      overlay.className = "nav-overlay";
      overlay.setAttribute("data-nav-overlay", "");
      overlay.setAttribute("aria-hidden", "true");
      document.body.appendChild(overlay);
    }

    const hasDrawer = document.getElementById("site-nav-drawer");
    if (!hasDrawer) {
      const drawer = document.createElement("aside");
      drawer.className = "nav-drawer";
      drawer.id = "site-nav-drawer";
      drawer.setAttribute("aria-hidden", "true");
      drawer.setAttribute("aria-label", "Site menu");

      drawer.innerHTML = `
        <div class="drawer-top">
          <div class="drawer-title">Menu</div>
        </div>
        <nav aria-label="Mobile">
          <a href="/projects/">Projects</a>
          <a href="/journal/">Journal</a>
          <a href="/inquiry/">Inquiry</a>
          <a href="/contact/">Contact</a>
        </nav>
        <div class="drawer-ctas">
          <a
            class="drawer-cta"
            href="${calendlyUrl}"
            data-calendly-cta
            target="_blank"
            rel="noopener"
          >Book a free 15-minute call</a>
          <a class="drawer-cta drawer-cta--secondary" href="/inquiry/">Get a free quote</a>
        </div>
      `.trim();

      document.body.appendChild(drawer);
    }
  };

  const mount = () => {
    const html = window.JQ33?.components?.headerNav;
    if (!html) return;
    const targets = document.querySelectorAll(
      'header.header-nav[data-component="header-nav"]'
    );
    for (const el of targets) el.innerHTML = html;
    ensureDrawer();
  };

  window.JQ33.components.mountHeaderNav = mount;

  mount();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  }
})();


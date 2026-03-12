(() => {
  window.JQ33 = window.JQ33 || {};
  window.JQ33.components = window.JQ33.components || {};

  window.JQ33.components.siteFooter = `
  <div class="info-pillar pillar-left">
    <div class="content-block asymmetric-offset">
      <div class="label">Enquiries</div>
      <div class="heavy-text">
        <a href="mailto:hello@jq33.design">hello@jq33.design</a>
        <div>+1 514 473 0075</div>
      </div>
    </div>
    <div class="content-block">
      <div class="label">Availability</div>
      <div class="heavy-text footer-availability">
        <div>Now booking: Next 2-4 weeks</div>
        <div>Fast turnaround options (7-14 days)</div>
      </div>
    </div>
  </div>

  <div class="info-pillar pillar-right">
    <div class="content-block footer-hq">
      <div class="label">Headquarters</div>
      <div class="heavy-text">
        <div>2727 Saint-Patrick St.</div>
        <div>Montreal, Quebec H3K 0A8</div>
      </div>
    </div>
    <div class="content-block">
      <div class="label">Explore</div>
      <nav class="footer-nav" aria-label="Footer">
        <a href="/projects/">Projects</a>
        <a href="/commercial-interior-design-montreal/">Commercial Interiors</a>
        <a href="/cafe-interior-design-montreal/">Cafe Interiors</a>
        <a href="/salon-interior-design-montreal/">Salon Interiors</a>
        <a href="/clinic-interior-design-montreal/">Clinic Interiors</a>
        <a href="/retail-interior-design-montreal/">Retail Interiors</a>
        <a href="/office-interior-design-montreal/">Office Interiors</a>
        <a href="/journal/">Journal</a>
        <a href="/inquiry/">Inquiry</a>
        <a href="/contact/">Contact</a>
      </nav>
    </div>
    <div class="content-block">
      <div class="label">Social</div>
      <div class="social-links">
        <a
          href="https://instagram.com/jq33design"
          target="_blank"
          rel="noopener noreferrer"
          title="Instagram"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
            <circle cx="17.5" cy="6.5" r="1.5"></circle>
          </svg>
        </a>
        <a
          href="https://facebook.com/jq33design"
          target="_blank"
          rel="noopener noreferrer"
          title="Facebook"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
            ></path>
          </svg>
        </a>
        <a
          href="https://youtube.com/jq33design"
          target="_blank"
          rel="noopener noreferrer"
          title="YouTube"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
            ></path>
          </svg>
        </a>
        <a
          href="https://behance.net/jq33design"
          target="_blank"
          rel="noopener noreferrer"
          title="Behance"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M6.938 4.503H0v14.419h6.938c3.793 0 6.855-3.01 6.855-6.747 0-3.751-3.062-6.672-6.855-6.672zM6.94 15.588H3.722V7.13h3.219c2.224 0 3.634 1.728 3.634 4.229 0 2.501-1.41 4.229-3.634 4.229zM14.528 12.528c0 .363.024.782.072 1.155h-6.884c.181 1.501 1.41 2.455 2.909 2.455 1.045 0 2.016-.545 2.433-1.362h2.854c-.725 2.089-2.909 3.634-5.287 3.634-3.326 0-5.896-2.571-5.896-5.896 0-3.289 2.57-5.899 5.896-5.899 3.327 0 5.896 2.61 5.896 5.913zm-2.854-.363h-3.966c.181-1.226 1.062-2.097 2.009-2.097.947 0 1.755.871 1.957 2.097z"
            ></path>
          </svg>
        </a>
      </div>
      <div class="footer-legal">
        <a href="/privacy/">Privacy</a>
        <a href="/terms/">Terms</a>
        <span>&copy; 2026 JQ33 DESIGN</span>
      </div>
    </div>
  </div>
  `.trim();

  const mount = () => {
    const html = window.JQ33?.components?.siteFooter;
    if (!html) return;
    const targets = document.querySelectorAll('[data-component="footer"]');
    for (const el of targets) {
      el.innerHTML = html;
    }
  };

  window.JQ33.components.mountFooter = mount;

  mount();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  }
})();

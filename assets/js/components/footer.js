(() => {
  "use strict";

  window.JQ33 = window.JQ33 || {};
  window.JQ33.components = window.JQ33.components || {};

  const iconPaths = Object.freeze({
    instagram:
      "M7.8 2h8.4A5.8 5.8 0 0 1 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8A5.8 5.8 0 0 1 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2Zm-.2 2A3.6 3.6 0 0 0 4 7.6v8.8A3.6 3.6 0 0 0 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6A3.6 3.6 0 0 0 16.4 4H7.6Zm9.65 1.5a1.35 1.35 0 1 1 0 2.7 1.35 1.35 0 0 1 0-2.7ZM12 6.85A5.15 5.15 0 1 1 6.85 12 5.15 5.15 0 0 1 12 6.85Zm0 2A3.15 3.15 0 1 0 15.15 12 3.15 3.15 0 0 0 12 8.85Z",
    facebook:
      "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z",
    youtube:
      "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568Z",
    behance:
      "M8.28 11.22s1.85-.14 1.85-2.31c0-2.16-1.51-3.21-3.43-3.21H.37v12.06H6.7s3.84.12 3.84-3.56c0 0 .17-2.98-2.26-2.98ZM3.16 7.84H6.7s.86 0 .86 1.26-.5 1.44-1.35 1.44H3.16v-2.7Zm3.37 7.78H3.16v-3.23H6.7s1.28-.01 1.28 1.66c0 1.41-.95 1.57-1.45 1.57Zm9.67-6.87c-4.65 0-4.65 4.65-4.65 4.65s-.32 4.62 4.65 4.62c0 0 4.14.24 4.14-3.22h-2.13s.07 1.3-1.94 1.3c0 0-2.13.15-2.13-2.1h6.27s.68-4.01-1.87-5.68c0 0-.95-.57-2.34-.57Zm-2.08 3.27s.26-1.86 2.13-1.86 1.85 1.86 1.85 1.86h-3.98Zm-.69-5.69h5.01v1.52h-5.01V6.33Z",
  });

  const parseProfiles = () => {
    try {
      const parsed = JSON.parse("{{SOCIAL_PROFILES_JSON}}");
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (profile) =>
          profile &&
          typeof profile.network === "string" &&
          typeof profile.url === "string" &&
          iconPaths[profile.network.toLowerCase()],
      );
    } catch {
      return [];
    }
  };

  const renderSocialLinks = () => {
    const profiles = parseProfiles();
    if (!profiles.length) return "";

    const links = profiles
      .map((profile) => {
        const network = profile.network.toLowerCase();
        const label = `${network[0].toUpperCase()}${network.slice(1)}`;
        return `
          <a
            class="social-link social-link--${network}"
            href="${profile.url}"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="JQ33 DESIGN on ${label}"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="${iconPaths[network]}"></path>
            </svg>
          </a>`;
      })
      .join("");

    return `
      <div class="label">Social</div>
      <div class="social-links">${links}</div>`;
  };

  window.JQ33.components.siteFooter = `
    <div class="info-pillar pillar-left">
      <div class="content-block asymmetric-offset">
        <div class="label">Enquiries</div>
        <div class="heavy-text">
          <a href="mailto:hello@jq33.design">hello@jq33.design</a>
          <div>+1 514 473 0075</div>
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
          <a href="/projects/">Concept studies</a>
          <a href="/commercial-interior-design-montreal/">Commercial interior design</a>
          <a href="/journal/">Design journal</a>
          <a href="/inquiry/">Project inquiry</a>
          <a href="/contact/">Contact</a>
        </nav>
      </div>
      <div class="content-block">
        ${renderSocialLinks()}
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
    for (const element of targets) {
      element.innerHTML = html;
    }
  };

  window.JQ33.components.mountFooter = mount;
  mount();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  }
})();

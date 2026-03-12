(() => {
  const config = window.JQ33 || {};
  const supabaseUrl = config.SUPABASE_URL;
  const anonKey = config.SUPABASE_ANON_KEY;
  const PLACEHOLDER_TOKEN = /your-anon-key|your-project/i;

  const container = document.getElementById("project-container");
  const heroImage = document.getElementById("hero-image");
  const heroTitle = document.getElementById("hero-title");
  const detailsGrid = document.getElementById("details-grid");
  const narrative = document.getElementById("narrative");
  const gallery = document.getElementById("gallery");
  const prevLink = document.getElementById("prev-project");
  const nextLink = document.getElementById("next-project");

  const showStatus = (message) => {
    if (!container) return;
    container.innerHTML = `<div class="status-message">${message}</div>`;
  };

  if (
    !supabaseUrl ||
    !anonKey ||
    PLACEHOLDER_TOKEN.test(supabaseUrl) ||
    PLACEHOLDER_TOKEN.test(anonKey)
  ) {
    showStatus("Project data is not configured yet.");
    return;
  }

  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`
  };

  const fetchJson = async (path) => {
    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers });
    if (!response.ok) {
      throw new Error("Request failed");
    }
    return response.json();
  };

  const getSlug = () => {
    const path = window.location.pathname.replace(/\/+$/, "");
    const parts = path.split("/");
    const slug = parts[parts.length - 1];
    if (slug === "project.html" || slug === "projects") {
      const querySlug = new URLSearchParams(window.location.search).get("slug");
      return querySlug || "";
    }
    return slug;
  };

  const toPublicUrl = (path) => {
    if (!path) return "";
    const clean = path.replace(/^\/+/, "");
    return `${supabaseUrl}/storage/v1/object/public/${clean}`;
  };

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const setMeta = (selector, content) => {
    const node = document.querySelector(selector);
    if (node && content) {
      node.setAttribute("content", content);
    }
  };

  const setCanonical = (href) => {
    const node = document.querySelector('link[rel="canonical"]');
    if (node && href) {
      node.setAttribute("href", href);
    }
  };

  const renderDetails = (project) => {
    const items = [];
    if (project.year) {
      items.push({ label: "Year", lines: [project.year] });
    }
    if (project.category) {
      items.push({ label: "Category", lines: [project.category] });
    }

    if (!items.length) {
      detailsGrid.style.display = "none";
      return;
    }

    detailsGrid.innerHTML = items
      .map(
        (item) => `
        <div class="info-col">
          <div class="label">${escapeHtml(item.label)}</div>
          ${item.lines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
        </div>`
      )
      .join("");
  };

  const renderNarrative = (summary) => {
    if (!summary) {
      narrative.style.display = "none";
      return;
    }

    narrative.innerHTML = `
      <div class="info-col">
        <div class="label">Project Summary</div>
        <div class="narrative-text">${escapeHtml(summary)}</div>
      </div>
    `;
  };

  const renderGallery = (items) => {
    if (!items.length) {
      gallery.style.display = "none";
      return;
    }

    gallery.innerHTML = items
      .map((item, index) => {
        const src = toPublicUrl(item.path);
        const alt = escapeHtml(item.alt || `Project gallery ${index + 1}`);
        const caption = item.caption ? `<div class="gallery-caption">${escapeHtml(item.caption)}</div>` : "";
        return `
        <div class="gallery-item">
          <img
            src="${src}"
            class="gallery-image"
            alt="${alt}"
            width="2400"
            height="1600"
            loading="lazy"
            decoding="async"
          />
          ${caption}
        </div>`;
      })
      .join("");
  };

  const renderNav = (projects, currentSlug) => {
    const index = projects.findIndex((item) => item.slug === currentSlug);
    const prev = index > 0 ? projects[index - 1] : null;
    const next = index >= 0 && index < projects.length - 1 ? projects[index + 1] : null;

    if (prev) {
      prevLink.textContent = `← ${prev.title}`;
      prevLink.href = `/projects/${prev.slug}/`;
      prevLink.classList.remove("disabled");
    } else {
      prevLink.textContent = "Previous";
      prevLink.href = "#";
      prevLink.classList.add("disabled");
    }

    if (next) {
      nextLink.textContent = `${next.title} →`;
      nextLink.href = `/projects/${next.slug}/`;
      nextLink.classList.remove("disabled");
    } else {
      nextLink.textContent = "Next";
      nextLink.href = "#";
      nextLink.classList.add("disabled");
    }
  };

  const init = async () => {
    const slug = getSlug();
    if (!slug) {
      showStatus("Project not found.");
      return;
    }

    const projects = await fetchJson(
      "portfolio_projects?select=id,slug,title,title_lines,hero_title_lines,year,category,summary,meta_title,meta_description,sort_order&order=sort_order.asc,created_at.desc"
    );
    const project = projects.find((item) => item.slug === slug);

    if (!project) {
      showStatus("Project not found.");
      return;
    }

    const images = await fetchJson(
      `portfolio_images?select=path,caption,alt,is_hero,sort_order&project_id=eq.${project.id}&order=sort_order.asc`
    );

    const hero = images.find((item) => item.is_hero) || images[0];
    const heroLines =
      (project.hero_title_lines && project.hero_title_lines.length
        ? project.hero_title_lines
        : project.title_lines) || [project.title];

    const heroHtml = heroLines.map((line) => escapeHtml(line)).join("<br />");
    const heroUrl = hero ? toPublicUrl(hero.path) : "";

    if (heroImage) {
      heroImage.src = heroUrl;
      heroImage.alt = project.title || "Project hero";
    }
    if (heroTitle) {
      heroTitle.innerHTML = heroHtml;
    }

    renderDetails(project);
    renderNarrative(project.summary);

    const galleryItems = images.filter((item) => item !== hero);
    renderGallery(galleryItems);

    renderNav(projects, slug);

    const metaTitle =
      project.meta_title ||
      `${project.title} | JQ33 DESIGN Commercial Interior Project (Montreal)`;
    const metaDescription = project.meta_description || project.summary || "";
    const canonicalUrl = `${window.location.origin}/projects/${project.slug}/`;

    document.title = metaTitle;
    setMeta('meta[name="description"]', metaDescription);
    setMeta('meta[property="og:title"]', metaTitle);
    setMeta('meta[property="og:description"]', metaDescription);
    setMeta('meta[property="og:image"]', heroUrl);
    setMeta('meta[property="og:url"]', canonicalUrl);
    setMeta('meta[name="twitter:title"]', metaTitle);
    setMeta('meta[name="twitter:description"]', metaDescription);
    setMeta('meta[name="twitter:image"]', heroUrl);
    setCanonical(canonicalUrl);
  };

  init().catch(() => {
    showStatus("Project not available right now.");
  });
})();

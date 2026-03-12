(() => {
  const config = window.JQ33 || {};
  const supabaseUrl = config.SUPABASE_URL;
  const anonKey = config.SUPABASE_ANON_KEY;
  const PLACEHOLDER_TOKEN = /your-anon-key|your-project/i;

  const list = document.querySelector("[data-portfolio-list]");
  const mainBg = document.getElementById("main-bg");

  const showMessage = (message) => {
    if (!list) return;
    list.innerHTML = `<div style="opacity:0.7; padding: 2rem 0;">${message}</div>`;
  };

  if (
    !supabaseUrl ||
    !anonKey ||
    PLACEHOLDER_TOKEN.test(supabaseUrl) ||
    PLACEHOLDER_TOKEN.test(anonKey)
  ) {
    showMessage("Portfolio data is not configured yet.");
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

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const toPublicUrl = (path) => {
    if (!path) return "";
    const clean = path.replace(/^\/+/, "");
    return `${supabaseUrl}/storage/v1/object/public/${clean}`;
  };

  const renderTitleLines = (project) => {
    const lines = project.title_lines?.length ? project.title_lines : [project.title];
    return lines.map((line) => escapeHtml(line)).join("<br />");
  };

  const init = async () => {
    const projects = await fetchJson(
      "portfolio_projects?select=id,slug,title,title_lines,year,category,sort_order&order=sort_order.asc,created_at.desc"
    );
    const previews = await fetchJson(
      "portfolio_images?select=project_id,path,is_preview,sort_order&is_preview=eq.true"
    );

    const previewMap = new Map();
    previews.forEach((item) => {
      if (!previewMap.has(item.project_id)) {
        previewMap.set(item.project_id, item.path);
      }
    });

    if (!projects.length) {
      showMessage("New projects are being prepared.");
      return;
    }

    list.innerHTML = projects
      .map((project) => {
        const previewPath = previewMap.get(project.id);
        const previewUrl = previewPath ? toPublicUrl(previewPath) : "";
        return `
        <a
          class="project-item"
          href="/projects/${project.slug}/"
          data-img="${previewUrl}"
          data-title="${escapeHtml(project.title || "")}"
          onmouseenter="hoverProject(this)"
          onmouseleave="leaveProject()"
        >
          <div class="project-meta">
            <span class="project-year">${escapeHtml(project.year || "")}</span>
            <h2 class="project-title">${renderTitleLines(project)}</h2>
          </div>
          <div class="project-category">${escapeHtml(project.category || "")}</div>
        </a>`;
      })
      .join("");

    const firstPreview = previewMap.get(projects[0].id);
    if (firstPreview && mainBg) {
      mainBg.style.backgroundImage = `url(${toPublicUrl(firstPreview)})`;
    }
  };

  init().catch(() => {
    showMessage("Could not load the portfolio right now.");
  });
})();

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const config = window.JQ33 || {};
const supabaseUrl = config.SUPABASE_URL;
const supabaseKey = config.SUPABASE_ANON_KEY;
const adminUploadFunctionUrl =
  config.ADMIN_UPLOAD_FUNCTION_URL ||
  (supabaseUrl ? `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/admin-portfolio-upload` : "");

const authStatus = document.getElementById("auth-status");
const uploadStatus = document.getElementById("upload-status");
const signInButton = document.getElementById("sign-in-button");
const signOutButton = document.getElementById("sign-out-button");
const emailInput = document.getElementById("admin-email");
const form = document.getElementById("portfolio-form");
const titleInput = document.getElementById("project-title");
const slugInput = document.getElementById("project-slug");
const titleLinesInput = document.getElementById("project-title-lines");
const fileInput = document.getElementById("project-images");
const fileList = document.getElementById("file-list");

const PLACEHOLDER_TOKEN = /your-anon-key|your-project/i;
const MAX_FILES = 10;

const setStatus = (node, message, type) => {
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("is-error", type === "error");
  node.classList.toggle("is-success", type === "success");
};

if (!supabaseUrl || !supabaseKey || PLACEHOLDER_TOKEN.test(supabaseUrl) || PLACEHOLDER_TOKEN.test(supabaseKey)) {
  setStatus(
    authStatus,
    "Supabase is not configured. Update assets/js/supabase-config.js first.",
    "error"
  );
}

if (!adminUploadFunctionUrl || PLACEHOLDER_TOKEN.test(adminUploadFunctionUrl)) {
  setStatus(
    uploadStatus,
    "Admin upload endpoint is not configured. Set ADMIN_UPLOAD_FUNCTION_URL in assets/js/supabase-config.js.",
    "error"
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

const parseTitleLines = (value, fallback) => {
  const raw = String(value || "").trim();
  if (raw) {
    return raw
      .split("/")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  return fallback ? [fallback] : [];
};

const renderFileList = (files) => {
  fileList.innerHTML = "";
  files.forEach((file, index) => {
    const item = document.createElement("div");
    item.className = "file-item";
    item.innerHTML = `
      <div class="file-name">${file.name}</div>
      <div class="admin-field">
        <label class="admin-label">Caption (optional)</label>
        <input type="text" data-caption-index="${index}" placeholder="Fig 01. Hero moment" />
      </div>
      <div class="admin-field">
        <label class="admin-label">Alt text (optional)</label>
        <input type="text" data-alt-index="${index}" placeholder="Describe the image" />
      </div>
    `;
    fileList.appendChild(item);
  });
};

const verifyAdmin = async (user) => {
  if (!user?.email) return false;
  const { data, error } = await supabase
    .from("admin_users")
    .select("id")
    .eq("email", user.email)
    .maybeSingle();

  if (error) return false;
  return Boolean(data);
};

const setAdminState = (isAdmin) => {
  if (!form) return;
  form.classList.toggle("hidden", !isAdmin);
  signOutButton?.classList.toggle("hidden", !isAdmin);
};

const refreshSession = async () => {
  const { data } = await supabase.auth.getSession();
  const user = data?.session?.user ?? null;

  if (!user) {
    setAdminState(false);
    return;
  }

  const isAdmin = await verifyAdmin(user);
  if (!isAdmin) {
    setStatus(authStatus, "This email is not authorized for uploads.", "error");
    await supabase.auth.signOut();
    setAdminState(false);
    return;
  }

  setStatus(authStatus, `Signed in as ${user.email}.`, "success");
  setAdminState(true);
};

supabase.auth.onAuthStateChange(() => {
  refreshSession();
});

signInButton?.addEventListener("click", async () => {
  const email = emailInput?.value?.trim();
  if (!email) {
    setStatus(authStatus, "Enter a valid email address.", "error");
    return;
  }

  signInButton.disabled = true;
  setStatus(authStatus, "Sending magic link...", "success");

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/admin/portfolio/`
    }
  });

  if (error) {
    setStatus(authStatus, "Could not send the magic link. Try again.", "error");
  } else {
    setStatus(authStatus, "Magic link sent. Check your email.", "success");
  }

  signInButton.disabled = false;
});

signOutButton?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  setAdminState(false);
  setStatus(authStatus, "Signed out.", "success");
});

let slugManuallyEdited = false;
slugInput?.addEventListener("input", () => {
  slugManuallyEdited = true;
});

titleInput?.addEventListener("input", () => {
  if (!slugManuallyEdited && slugInput) {
    slugInput.value = slugify(titleInput.value);
  }
});

fileInput?.addEventListener("change", () => {
  const files = Array.from(fileInput.files || []).slice(0, MAX_FILES);
  renderFileList(files);
  if (fileInput.files && fileInput.files.length > MAX_FILES) {
    setStatus(uploadStatus, `Only ${MAX_FILES} images allowed.`, "error");
  }
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form || !fileInput) return;

  const files = Array.from(fileInput.files || []);
  if (!files.length) {
    setStatus(uploadStatus, "Add at least one image.", "error");
    return;
  }

  if (files.length > MAX_FILES) {
    setStatus(uploadStatus, `Only ${MAX_FILES} images allowed.`, "error");
    return;
  }

  const title = titleInput?.value?.trim();
  const slug = slugInput?.value?.trim();
  const year = document.getElementById("project-year")?.value?.trim() || null;
  const category = document.getElementById("project-category")?.value?.trim() || null;
  const summary = document.getElementById("project-summary")?.value?.trim();
  const sortOrderValue = document.getElementById("project-sort-order")?.value?.trim();
  const sortOrder = sortOrderValue ? Number.parseInt(sortOrderValue, 10) : 0;

  if (!title || !slug || !summary) {
    setStatus(uploadStatus, "Title, slug, and description are required.", "error");
    return;
  }

  setStatus(uploadStatus, "Creating project...", "success");

  const titleLines = parseTitleLines(titleLinesInput?.value, title);
  const captionInputs = fileList.querySelectorAll("[data-caption-index]");
  const altInputs = fileList.querySelectorAll("[data-alt-index]");

  const captions = files.map((_, index) => captionInputs[index]?.value?.trim() || "");
  const alts = files.map((_, index) => altInputs[index]?.value?.trim() || "");

  const {
    data: { session }
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;

  if (!accessToken) {
    setStatus(uploadStatus, "Your session expired. Sign in again.", "error");
    return;
  }

  const body = new FormData();
  body.append("title", title);
  body.append("slug", slug);
  body.append("year", year || "");
  body.append("category", category || "");
  body.append("summary", summary);
  body.append("title_lines", JSON.stringify(titleLines));
  body.append("sort_order", String(Number.isFinite(sortOrder) ? sortOrder : 0));
  body.append("captions", JSON.stringify(captions));
  body.append("alts", JSON.stringify(alts));

  files.forEach((file) => {
    body.append("images", file);
  });

  setStatus(uploadStatus, "Uploading images...", "success");

  const response = await fetch(adminUploadFunctionUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: supabaseKey
    },
    body
  });

  if (!response.ok) {
    setStatus(uploadStatus, "Upload failed. Please verify permissions and try again.", "error");
    return;
  }

  form.reset();
  fileList.innerHTML = "";
  slugManuallyEdited = false;
  setStatus(uploadStatus, "Project uploaded successfully.", "success");
});

refreshSession();

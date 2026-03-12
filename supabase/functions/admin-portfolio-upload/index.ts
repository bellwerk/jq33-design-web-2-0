import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const MAX_FILES = 10;
const MAX_FILE_SIZE_BYTES = 12 * 1024 * 1024;
const DEFAULT_ALLOWED_ORIGINS = [
  "https://jq33.design",
  "http://localhost:3000",
  "http://localhost:8788"
];

const UploadSchema = z.object({
  title: z.string().trim().min(1).max(180),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  year: z.string().trim().max(20).optional(),
  category: z.string().trim().max(120).optional(),
  summary: z.string().trim().min(1).max(3000),
  sort_order: z.coerce.number().int().min(0).max(9999).default(0),
  title_lines: z.array(z.string().trim().min(1).max(120)).max(6).optional(),
  captions: z.array(z.string().trim().max(220)).max(MAX_FILES).optional(),
  alts: z.array(z.string().trim().max(220)).max(MAX_FILES).optional()
});

const getAllowedOrigins = () => {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return new Set(configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS);
};

const allowedOrigins = getAllowedOrigins();

const getCorsHeaders = (origin: string | null) => {
  const allowOrigin =
    origin && (allowedOrigins.has(origin) || allowedOrigins.has("*"))
      ? origin
      : allowedOrigins.has("*")
        ? "*"
        : DEFAULT_ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin"
  };
};

const json = (origin: string | null, status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...getCorsHeaders(origin),
      "Content-Type": "application/json"
    }
  });

const parseJsonField = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  return JSON.parse(value);
};

const sanitizeFileName = (name: string) =>
  name
    .replace(/[^a-zA-Z0-9.\-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return json(origin, 405, { error: "Method not allowed." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("admin-portfolio-upload: missing server env");
    return json(origin, 500, { error: "Server not configured." });
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return json(origin, 401, { error: "Missing auth token." });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user?.email) {
    return json(origin, 401, { error: "Invalid auth token." });
  }

  const adminEmail = userData.user.email.toLowerCase();
  const { data: adminRow, error: adminError } = await supabase
    .from("admin_users")
    .select("id")
    .eq("email", adminEmail)
    .maybeSingle();

  if (adminError || !adminRow) {
    return json(origin, 403, { error: "Not authorized." });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return json(origin, 400, { error: "Invalid form payload." });
  }

  const images = formData.getAll("images").filter((entry) => entry instanceof File) as File[];
  if (images.length < 1 || images.length > MAX_FILES) {
    return json(origin, 400, { error: `Upload between 1 and ${MAX_FILES} images.` });
  }

  for (const image of images) {
    if (!image.type.startsWith("image/")) {
      return json(origin, 400, { error: "Only image files are allowed." });
    }
    if (image.size > MAX_FILE_SIZE_BYTES) {
      return json(origin, 400, { error: "Image is too large." });
    }
  }

  let parsedInput: z.infer<typeof UploadSchema>;
  try {
    parsedInput = UploadSchema.parse({
      title: formData.get("title"),
      slug: String(formData.get("slug") || "").toLowerCase(),
      year: formData.get("year") || undefined,
      category: formData.get("category") || undefined,
      summary: formData.get("summary"),
      sort_order: formData.get("sort_order") || 0,
      title_lines: parseJsonField(formData.get("title_lines")),
      captions: parseJsonField(formData.get("captions")),
      alts: parseJsonField(formData.get("alts"))
    });
  } catch {
    return json(origin, 400, { error: "Invalid form fields." });
  }

  const titleLines = parsedInput.title_lines?.length
    ? parsedInput.title_lines
    : [parsedInput.title];
  const heroTitleLines = titleLines.map((line) => line.toUpperCase());
  const metaTitle = `${parsedInput.title} | JQ33 DESIGN Commercial Interior Project (Montreal)`;
  const metaDescription =
    parsedInput.summary.length > 160
      ? `${parsedInput.summary.slice(0, 157)}...`
      : parsedInput.summary;

  const uploadedPaths: string[] = [];
  let createdProjectId: string | null = null;

  try {
    const { data: project, error: projectError } = await supabase
      .from("portfolio_projects")
      .insert({
        slug: parsedInput.slug,
        title: parsedInput.title,
        title_lines: titleLines,
        hero_title_lines: heroTitleLines,
        year: parsedInput.year || null,
        category: parsedInput.category || null,
        summary: parsedInput.summary,
        meta_title: metaTitle,
        meta_description: metaDescription,
        sort_order: parsedInput.sort_order
      })
      .select("id, slug")
      .single();

    if (projectError || !project) {
      if (projectError?.code === "23505") {
        return json(origin, 409, { error: "Slug already exists." });
      }
      throw new Error("project insert failed");
    }

    createdProjectId = project.id;

    for (let index = 0; index < images.length; index += 1) {
      const file = images[index];
      const safeName = sanitizeFileName(file.name || `image-${index + 1}.jpg`);
      const filePath = `projects/${project.slug}/${crypto.randomUUID()}-${safeName}`;
      const bytes = await file.arrayBuffer();

      const { error: uploadError } = await supabase.storage.from("portfolio").upload(filePath, bytes, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "application/octet-stream"
      });

      if (uploadError) {
        throw new Error("storage upload failed");
      }

      uploadedPaths.push(filePath);

      const caption = parsedInput.captions?.[index] || null;
      const alt = parsedInput.alts?.[index] || null;

      const { error: imageError } = await supabase.from("portfolio_images").insert({
        project_id: project.id,
        path: filePath,
        caption,
        alt,
        sort_order: index,
        is_hero: index === 0,
        is_preview: index === 0
      });

      if (imageError) {
        throw new Error("image metadata insert failed");
      }
    }

    return json(origin, 200, {
      status: "ok",
      project: { id: project.id, slug: project.slug },
      uploaded_count: images.length
    });
  } catch (error) {
    if (uploadedPaths.length > 0) {
      await supabase.storage.from("portfolio").remove(uploadedPaths);
    }

    if (createdProjectId) {
      await supabase.from("portfolio_projects").delete().eq("id", createdProjectId);
    }

    console.error("admin-portfolio-upload: request failed", {
      message: error instanceof Error ? error.message : "unknown",
      user: adminEmail
    });

    return json(origin, 500, { error: "Could not upload project." });
  }
});

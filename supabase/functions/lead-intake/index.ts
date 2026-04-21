import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://jq33.design",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8788"
];

const getAllowedOrigins = () => {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS);
};

const allowedOrigins = getAllowedOrigins();

const getAnonKey = () =>
  Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("PUBLIC_SUPABASE_ANON_KEY") || "";

const isAllowedOrigin = (origin: string | null) => {
  if (!origin) return false;
  return allowedOrigins.has(origin) || allowedOrigins.has("*");
};

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
    headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" }
  });

const LeadSchema = z
  .object({
    form_type: z.enum(["contact", "inquiry"]),
    name: z.string().trim().min(1).max(120).optional(),
    email: z.string().trim().email().optional(),
    project_type: z.string().trim().min(1).max(120).optional(),
    message: z.string().trim().min(1).max(2000).optional(),
    space_type: z.string().trim().min(1).max(120).optional(),
    project_goals: z.string().trim().min(1).max(2000).optional(),
    name_business: z.string().trim().min(1).max(200).optional(),
    source_path: z.string().trim().max(300).optional(),
    user_agent: z.string().trim().max(300).optional(),
    honeypot: z.string().trim().optional()
  })
  .strict();

const requireFields = (payload: z.infer<typeof LeadSchema>) => {
  if (payload.form_type === "contact") {
    const required = ["name", "email", "project_type", "message"] as const;
    return required.filter((field) => !payload[field]);
  }

  const required = ["name_business", "email", "space_type", "project_goals"] as const;
  return required.filter((field) => !payload[field]);
};

const formatEmailBody = (payload: z.infer<typeof LeadSchema>, ipAddress: string) => {
  const lines = [
    `Form: ${payload.form_type}`,
    `Name: ${payload.name ?? payload.name_business ?? "—"}`,
    `Email: ${payload.email ?? "—"}`,
    payload.project_type ? `Project type: ${payload.project_type}` : "",
    payload.space_type ? `Space type: ${payload.space_type}` : "",
    payload.message ? `Message: ${payload.message}` : "",
    payload.project_goals ? `Project goals: ${payload.project_goals}` : "",
    payload.source_path ? `Source: ${payload.source_path}` : "",
    ipAddress ? `IP: ${ipAddress}` : ""
  ].filter(Boolean);

  return lines.join("\n");
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return json(origin, 405, { error: "Method not allowed." });
  }

  if (!isAllowedOrigin(origin)) {
    return json(origin, 403, { error: "Origin not allowed." });
  }

  const anonKey = getAnonKey();
  if (!anonKey) {
    console.error("lead-intake: missing anon key for auth");
    return json(origin, 500, { error: "Server not configured." });
  }

  const apiKeyHeader = req.headers.get("apikey") || "";
  const authHeader = req.headers.get("authorization") || "";
  const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (apiKeyHeader !== anonKey || bearerToken !== anonKey) {
    return json(origin, 401, { error: "Unauthorized." });
  }

  let payload: z.infer<typeof LeadSchema>;

  try {
    const body = await req.json();
    payload = LeadSchema.parse(body);
  } catch {
    return json(origin, 400, { error: "Invalid payload." });
  }

  if (payload.honeypot) {
    return json(origin, 200, { status: "ok" });
  }

  const missingFields = requireFields(payload);
  if (missingFields.length > 0) {
    return json(origin, 400, { error: "Missing required fields." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("lead-intake: missing server env");
    return json(origin, 500, { error: "Server not configured." });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  const ipAddress = req.headers.get("x-forwarded-for") ?? "";
  const userAgent = payload.user_agent ?? req.headers.get("user-agent") ?? "";

  const { error: insertError } = await supabase.from("leads").insert({
    form_type: payload.form_type,
    name: payload.name ?? payload.name_business ?? null,
    email: payload.email ?? null,
    project_type: payload.project_type ?? null,
    message: payload.message ?? null,
    space_type: payload.space_type ?? null,
    project_goals: payload.project_goals ?? null,
    name_business: payload.name_business ?? null,
    source_path: payload.source_path ?? null,
    user_agent: userAgent,
    ip_address: ipAddress
  });

  if (insertError) {
    console.error("lead-intake: lead insert failed", { form_type: payload.form_type });
    return json(origin, 500, { error: "Could not save lead." });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const toEmail = Deno.env.get("LEADS_TO_EMAIL");
  const fromEmail = Deno.env.get("LEADS_FROM_EMAIL");

  if (resendKey && toEmail && fromEmail) {
    const emailBody = formatEmailBody(payload, ipAddress);
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [toEmail],
          reply_to: payload.email ? [payload.email] : undefined,
          subject: `New ${payload.form_type} lead`,
          text: emailBody
        })
      });

      if (!response.ok) {
        console.error("lead-intake: resend failed", { status: response.status });
      }
    } catch (error) {
      console.error("lead-intake: resend fetch failed", { error: String(error) });
    }
  }

  return json(origin, 200, { status: "ok" });
});

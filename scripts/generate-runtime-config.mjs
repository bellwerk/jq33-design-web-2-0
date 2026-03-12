import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const templatePath = path.join(rootDir, "assets", "js", "supabase-config.template.js");
const outputPath = path.join(rootDir, "assets", "js", "supabase-config.js");

const envOrFallback = (key, fallback = "") => {
  const value = process.env[key];
  return typeof value === "string" ? value.trim() : fallback;
};

const supabaseUrl = envOrFallback("PUBLIC_SUPABASE_URL", "https://your-project.supabase.co");
const supabaseAnonKey = envOrFallback("PUBLIC_SUPABASE_ANON_KEY", "your-anon-key");
const leadFunctionUrl = envOrFallback(
  "PUBLIC_LEAD_FUNCTION_URL",
  supabaseUrl.includes("your-project")
    ? ""
    : `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/lead-intake`
);
const adminUploadFunctionUrl = envOrFallback(
  "PUBLIC_ADMIN_UPLOAD_FUNCTION_URL",
  supabaseUrl.includes("your-project")
    ? ""
    : `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/admin-portfolio-upload`
);

const values = {
  SUPABASE_URL: supabaseUrl,
  SUPABASE_ANON_KEY: supabaseAnonKey,
  LEAD_FUNCTION_URL: leadFunctionUrl,
  ADMIN_UPLOAD_FUNCTION_URL: adminUploadFunctionUrl,
  FORMSPREE_CONTACT_URL: envOrFallback("PUBLIC_FORMSPREE_CONTACT_URL"),
  FORMSPREE_INQUIRY_URL: envOrFallback("PUBLIC_FORMSPREE_INQUIRY_URL"),
  FORM_FALLBACK_ENABLED: envOrFallback("PUBLIC_FORM_FALLBACK_ENABLED", "false"),
  GA_MEASUREMENT_ID: envOrFallback("PUBLIC_GA_MEASUREMENT_ID")
};

const template = fs.readFileSync(templatePath, "utf8");
let output = template;

for (const [key, value] of Object.entries(values)) {
  output = output.replaceAll(`__${key}__`, JSON.stringify(value));
}

fs.writeFileSync(outputPath, output, "utf8");
console.log("Runtime config generated.");

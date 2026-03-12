# Cloudflare + Supabase Deployment

## 1) Cloudflare Pages project
- Framework preset: `None`
- Build command: `pnpm build`
- Build output directory: `.`

Cloudflare Pages can read `wrangler.toml` for local parity, but set production values in the Pages dashboard.

## 2) Required Pages environment variables
These are public-safe runtime values used to generate `assets/js/supabase-config.js` during build.

- `PUBLIC_SITE_URL` (example: `https://jq33.design`)
- `PUBLIC_SUPABASE_URL` (example: `https://<project>.supabase.co`)
- `PUBLIC_SUPABASE_ANON_KEY`
- `PUBLIC_LEAD_FUNCTION_URL` (optional override)
- `PUBLIC_ADMIN_UPLOAD_FUNCTION_URL` (optional override)
- `PUBLIC_FORM_FALLBACK_ENABLED` (`true` or `false`, default `false`)
- `PUBLIC_FORMSPREE_CONTACT_URL` (optional fallback)
- `PUBLIC_FORMSPREE_INQUIRY_URL` (optional fallback)
- `PUBLIC_GA_MEASUREMENT_ID` (optional)

## 3) Supabase function secrets
Set these in Supabase for Edge Functions:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALLOWED_ORIGINS` (comma-separated, include production + preview origins)
- `RESEND_API_KEY` (optional)
- `LEADS_TO_EMAIL` (optional)
- `LEADS_FROM_EMAIL` (optional)

## 4) Deploy functions
- Deploy `lead-intake` and `admin-portfolio-upload` to Supabase Edge Functions.
- Confirm both function URLs respond to `OPTIONS` and `POST` from your Cloudflare domain.

## 5) Pre-release checks
- `pnpm build`
- `pnpm check:links`
- `pnpm check:redirects`
- Submit contact form and inquiry form.
- Upload a project through `/admin/portfolio/`.

# Evidence Bundle: supabase-function-env-fallback-2026-06-05

## Summary
- Overall status: PASS
- Last updated: 2026-06-05

## Acceptance criteria evidence

### AC1
- Status: PASS
- Proof:
  - `lead-intake` now accepts `ANON_KEY`, `SUPABASE_ANON_KEY`, or `PUBLIC_SUPABASE_ANON_KEY` for anon-key auth.
  - Both functions now accept `SUPABASE_URL`/`URL` and `SUPABASE_SERVICE_ROLE_KEY`/`SERVICE_ROLE_KEY`.

### AC2
- Status: PASS
- Proof:
  - `npx supabase functions deploy lead-intake --project-ref pdfvgsnahwunywbvyqkz` passed.
  - Authenticated POST from `https://jq33-design-website.pages.dev` returned `200 {"status":"ok"}`.

### AC3
- Status: PASS
- Proof:
  - `npx supabase functions deploy admin-portfolio-upload --project-ref pdfvgsnahwunywbvyqkz` passed.
  - CORS preflight from `https://jq33-design-website.pages.dev` returned `200` with `Access-Control-Allow-Origin: https://jq33-design-website.pages.dev`.

### AC4
- Status: PASS
- Proof:
  - `pnpm check:launch` passed.
  - `.gitignore` excludes `supabase/.temp/` created by the Supabase CLI.

## Commands run
- `npx supabase functions deploy lead-intake --project-ref pdfvgsnahwunywbvyqkz`
- `npx supabase functions deploy admin-portfolio-upload --project-ref pdfvgsnahwunywbvyqkz`
- `pnpm check:launch`

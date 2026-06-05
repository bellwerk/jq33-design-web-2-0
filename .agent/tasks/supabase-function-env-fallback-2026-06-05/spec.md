# Task Spec: supabase-function-env-fallback-2026-06-05

## Metadata
- Task ID: supabase-function-env-fallback-2026-06-05
- Created: 2026-06-05

## Original task statement
Complete production launch setup by deploying and verifying Supabase Edge Functions.

## Acceptance criteria
- AC1: Edge Functions read Supabase runtime values from both documented names and Supabase-provided aliases.
- AC2: `lead-intake` deploys and accepts an authenticated production POST from the Cloudflare Pages preview origin.
- AC3: `admin-portfolio-upload` deploys and responds to production CORS preflight from the Cloudflare Pages preview origin.
- AC4: Changes are verified, committed, and pushed for production reproducibility.

## Verification plan
- Deploy both Edge Functions with `npx supabase functions deploy`.
- Run CORS preflight checks against both deployed functions.
- Run a real `lead-intake` POST with the public anon key.
- Run `pnpm check:launch`.

# JQ33 DESIGN deployment

Cloudflare Pages native Git integration is the only deployment path. A branch push creates a preview; merging to `main` creates production. Do not add a second GitHub deployment workflow or upload with Wrangler.

## Cloudflare Pages settings

Configure the existing `jq33-design-website` project:

- Production branch: `main`
- Preview deployments: enabled
- Root directory: repository root
- Build command: `corepack prepare pnpm@11.13.0 --activate && pnpm install --frozen-lockfile && pnpm build`
- Build output directory: `dist`
- `NODE_VERSION=22.23.2`
- `PNPM_VERSION=11.13.0`
- `SKIP_DEPENDENCY_INSTALL=1`

Set these public build-time values in both Preview and Production:

- `PUBLIC_FORMSPREE_CONTACT_URL`
- `PUBLIC_FORMSPREE_INQUIRY_URL`
- `PUBLIC_CALENDLY_URL`
- `PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN`

Contact and Inquiry must use different direct Formspree endpoints. Calendly must use a direct published event URL. Leave every `PUBLIC_SOCIAL_*` value empty unless the owner has confirmed that public profile.

These values are embedded in the static artifact. Account credentials, API tokens, session cookies, inbox addresses, and populated environment files must never be committed or included in evidence.

## Artifact boundary

Only `dist/` is public. Cloudflare Pages is configured to publish that directory, and `scripts/build.mjs` rebuilds it from an explicit allowlist. Source files, repository metadata, task evidence, templates, admin code, Pages Functions, and Supabase code are not deployment inputs.

Never deploy a fixture build. `pnpm build:test-fixtures` is only for local checks and deliberately embeds test endpoints.

## Launch flow

1. Run the local fixture gate under the pinned toolchain:

   ```powershell
   corepack prepare pnpm@11.13.0 --activate
   pnpm install --frozen-lockfile
   pnpm build:test-fixtures
   pnpm check:launch:test-fixtures
   ```

2. Push the candidate branch and wait for Cloudflare Pages to build its preview with the real Preview values.

3. Check the exact preview:

   ```powershell
   $env:DEPLOYED_BASE_URL='https://<preview>.pages.dev'
   pnpm check:deployed
   ```

4. Confirm all sitemap routes, real 404s, isolation paths, headers, mobile layouts, SEO, both form deliveries, and Calendly availability. Do not merge while any launch criterion is `FAIL` or `UNKNOWN`.

5. Merge the approved pull request to `main`. Cloudflare Pages deploys production automatically; do not run a manual upload.

6. Check production:

   ```powershell
   $env:DEPLOYED_BASE_URL='https://jq33.design'
   $env:EXPECT_PRODUCTION='1'
   pnpm check:deployed
   ```

7. Smoke-test both forms once, verify Calendly and analytics, and submit `https://jq33.design/sitemap.xml` in Search Console.

## Rollback

Before merging, record the active successful production deployment ID. If the homepage fails, portfolio routing loops, CSP blocks required site behavior, both forms fail globally, or server errors persist, use the Cloudflare Pages dashboard to roll back to that deployment and repeat the affected smoke checks.

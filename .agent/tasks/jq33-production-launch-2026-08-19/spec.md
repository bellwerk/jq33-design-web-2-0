# Minimal JQ33 Production Launch Specification

Status: FROZEN
Task ID: jq33-production-launch-2026-08-19
Frozen: 2026-08-19
Canonical production origin: https://jq33.design
Target locale and market: en-CA, Montreal
Candidate baseline: branch codex/jq33-production-readiness-2026-07-29 at bad2532e3a93ca0500630cb4a44642bd289e4cad

## Original task statement

> PLEASE IMPLEMENT THIS PLAN:
>
> # Minimal JQ33 Production Launch
>
> ## Summary
>
> Use the existing local candidate. No redesign, new pages, backend, CRM, custom CI, or infrastructure cleanup.
>
> The shortest safe path is: configure real integrations → deploy dist/ to a Cloudflare preview → test → merge → production smoke test.
>
> ## Changes
>
> 1. Freeze .agent/tasks/jq33-production-launch-2026-08-19/spec.md with the launch checks below.
> 2. Delete the 806-line custom GitHub deployment workflow. Do not replace it; Cloudflare Pages already builds previews and production from Git.
> 3. Configure Cloudflare Pages:
>
>    - Production branch: main
>    - Build: corepack prepare pnpm@11.13.0 --activate && pnpm install --frozen-lockfile && pnpm build
>    - Output: dist
>    - NODE_VERSION=22.23.2
>    - PNPM_VERSION=11.13.0
>    - SKIP_DEPENDENCY_INSTALL=1
>
> 4. Add to both Preview and Production:
>
>    - PUBLIC_FORMSPREE_CONTACT_URL
>    - PUBLIC_FORMSPREE_INQUIRY_URL
>    - PUBLIC_CALENDLY_URL
>    - PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN
>
> 5. Create two working Formspree endpoints and replace the dead Calendly event. Leave unconfirmed social variables empty.
> 6. Keep the five concept studies and current starting prices. Remove any business claim the owner cannot verify.
> 7. Publish only dist/; no Supabase, admin, source, template, or repository files.
>
> ## Launch Gate
>
> Run once locally with the real public values:
>
>     corepack prepare pnpm@11.13.0 --activate
>     pnpm install --frozen-lockfile
>     pnpm verify
>
> Require on the Cloudflare preview:
>
> - Every sitemap URL returns canonical 200; all five projects open without redirects.
> - Unknown pages return real 404 with noindex.
> - Repository, admin, template, and source paths return 404.
> - Contact and Inquiry each deliver exactly one controlled test message.
> - Calendly opens a published event with future availability.
> - Mobile home, projects, project detail, and contact pages have no overflow or console/CSP errors.
> - Titles, descriptions, canonicals, schema, robots, and sitemap pass.
> - CSP, HSTS, anti-framing, Permissions Policy, nosniff, and Referrer Policy are present.
>
> Then run:
>
>     $env:DEPLOYED_BASE_URL='https://<preview>.pages.dev'
>     pnpm check:deployed
>
> The proof loop produces only evidence.md, evidence.json, raw command output, and a fresh verdict. Fix only reproduced failures.
>
> ## Release and Rollback
>
> 1. Open a PR from the current candidate branch to main.
> 2. Merge only after the preview gate passes.
> 3. Let Cloudflare deploy main automatically.
> 4. Configure www and /home-page variants as one-hop 301 redirects to canonical URLs.
> 5. Repeat the deployed check against https://jq33.design, test both forms once, and submit the sitemap in Search Console.
> 6. Roll back through Cloudflare Pages if routing, forms, CSP, or the homepage fails. [Cloudflare rollback documentation](https://developers.cloudflare.com/pages/configuration/rollbacks/)
>
> Assumptions: English-only, Montreal-only, concept studies retained, current prices retained. At the owner’s direction, French-language compliance is outside this technical launch definition despite [OQLF guidance](https://www.oqlf.gouv.qc.ca/francisation/droits_linguistiques/droits/langue-du-commerce-et-des-affaires.html).

## Objective

Launch the existing static candidate through the existing Cloudflare Pages project with the minimum changes needed for a safe production release. Work is complete only after the current code, Cloudflare preview, and canonical production site satisfy every acceptance criterion below with current evidence.

## Defined launch surface

The only public HTML routes in scope are:

- /
- /commercial-interior-design-montreal/
- /projects/
- /projects/bruton-place-iv/
- /projects/ethereal-gallery/
- /projects/obsidian-lounge/
- /projects/vortex-showroom/
- /projects/canvas-studios/
- /journal/
- /journal/reduction-as-creation/
- /contact/
- /inquiry/
- /privacy/
- /terms/
- the branded not-found document, returned with HTTP 404

The five projects remain self-initiated concept studies: bruton-place-iv, ethereal-gallery, obsidian-lounge, vortex-showroom, and canvas-studios.

## Acceptance criteria

### AC1 — Frozen candidate and content boundaries

- Implementation starts from the recorded candidate baseline and makes only launch-closing changes required by this specification.
- The existing design, route set, five self-initiated concept studies, and starting prices of $2,900 CAD, $6,800 CAD, and $12,500 CAD are retained.
- Public business claims, contact details, service claims, availability, deliverables, and response-time claims are retained only when confirmed by the owner; an unconfirmed claim is removed rather than invented or generalized.
- An optional social link is emitted only when its public URL is owner-confirmed. Every unconfirmed social variable remains empty.
- No redesign, new page, backend, CRM, Supabase integration, admin interface, or unrelated infrastructure cleanup is introduced.

### AC2 — Cloudflare Pages is the sole deployment authority

- The 806-line custom workflow at .github/workflows/production-readiness.yml is deleted and no replacement custom GitHub build, preview, promotion, or production deployment workflow is added.
- The existing Cloudflare Pages project jq33-design-website uses native Git integration with main as its production branch and branch preview deployments enabled.
- Preview and Production use this exact build command:

      corepack prepare pnpm@11.13.0 --activate && pnpm install --frozen-lockfile && pnpm build

- Both environments use output directory dist and build variables NODE_VERSION=22.23.2, PNPM_VERSION=11.13.0, and SKIP_DEPENDENCY_INSTALL=1.
- A merge to main is the only production promotion action. No manual Wrangler upload or second production build system is used.
- Dashboard evidence records the connected repository, production branch, preview setting, build command, output directory, and non-sensitive build variables without exposing account credentials or session data.

### AC3 — Real public integrations

- Preview and Production each define non-placeholder values for PUBLIC_FORMSPREE_CONTACT_URL, PUBLIC_FORMSPREE_INQUIRY_URL, PUBLIC_CALENDLY_URL, and PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN.
- Contact and Inquiry use two different direct production Formspree endpoint URLs owned by the authorized account and routed to the approved destination inbox. Provider-side spam protection is enabled.
- PUBLIC_CALENDLY_URL is one direct, published event-type URL, not a profile root, draft event, redirect loop, or placeholder. Its public page loads successfully and visibly offers future availability.
- The Cloudflare Web Analytics token belongs to the jq33.design site and is the only analytics integration shipped.
- No account password, API token, session cookie, private inbox address, or other secret is committed, included in dist, printed in logs, or stored in task evidence. Public integration values are supplied locally without committing a populated environment file.

### AC4 — Reproducible local candidate

- Under Node 22.23.2, a clean local run with the real public integration values succeeds:

      corepack prepare pnpm@11.13.0 --activate
      pnpm install --frozen-lockfile
      pnpm verify

- The recorded Node version is 22.23.2, the recorded pnpm version is 11.13.0, and the frozen install does not change pnpm-lock.yaml.
- pnpm verify completes the production build and every repository launch check with exit code 0.
- The generated deployment root is dist only. It contains the defined launch surface, crawl files, host-control files, and required static assets, but no Supabase, admin, source, template, task, workflow, repository-metadata, environment, or build-script content.

### AC5 — Preview routes, 404s, and redirects

- Every canonical URL listed in the generated sitemap returns a direct HTTP 200 from the Cloudflare preview and declares exactly one matching https://jq33.design canonical URL.
- /projects/ and all five defined project routes return direct 200 responses without a redirect, rewrite loop, or generic project shell.
- Representative unknown root, unknown project, and nested unknown project paths return the branded not-found document with a genuine HTTP 404 and noindex; they do not redirect or return a soft 404.
- /home-page, /home-page/, and /home-page.html each produce one HTTP 301 to the canonical homepage, with no redirect chain or loop.
- robots.txt and sitemap.xml return 200, use the canonical production origin, and enumerate only canonical, indexable 200 routes.

### AC6 — Preview isolation and security

- At minimum, preview requests for /.agent/, /AGENTS.md, /CLAUDE.md, /.env, /.env.example, /package.json, /pnpm-lock.yaml, /wrangler.toml, /admin/, /data/projects.json, /scripts/build.mjs, /supabase/, /functions/, project and journal template paths, /_headers, and /_redirects return genuine 404 responses.
- Representative public 200 and branded 404 responses include an effective Content-Security-Policy, Strict-Transport-Security, X-Frame-Options: DENY, Permissions-Policy, X-Content-Type-Options: nosniff, and a restrictive Referrer-Policy.
- CSP denies framing, contains neither unsafe-inline nor unsafe-eval, permits only the integrations actually present, and produces no browser CSP violations on the checked pages.

### AC7 — Preview conversion and booking

- A uniquely tagged valid Contact submission through the preview reports success and delivers exactly one message to the approved inbox.
- A different uniquely tagged valid Inquiry submission through the preview reports success and delivers exactly one message to the approved inbox.
- For each form, client validation, visible error handling, retry after a controlled failure, honeypot behavior, preservation of values until confirmed success, and duplicate prevention are exercised. Double activation must not create a second request or message.
- Redacted browser/request and inbox evidence correlates each unique tag to one request and one received message without exposing private account data.
- Every booking action opens the same direct published Calendly event, and the event page visibly has at least one future time available. Creating or cancelling a booking is not required by this task.

### AC8 — Preview mobile and SEO checks

- The homepage, projects index, one project detail page, and Contact page are checked at 320, 375, and 414 CSS-pixel widths. Each has no horizontal overflow, clipped primary content, unusable navigation, wrapped or hidden primary action, console error, failed required asset, or CSP violation.
- Titles, meta descriptions, one-H1 structure, canonical links, Open Graph/Twitter metadata, and structured data are accurate for the represented page and pass the repository SEO checks.
- Schema describes only implemented site capabilities and supportable JQ33 facts. robots.txt and sitemap.xml are valid and mutually consistent.
- Preview browser checks do not introduce new visual-polish work; only reproduced launch-blocking defects may be fixed.

### AC9 — Preview deployment gate

- Against the exact preview selected for release, this command exits 0 and its generated records are retained:

      $env:DEPLOYED_BASE_URL='https://<preview>.pages.dev'
      pnpm check:deployed

- The preview URL, source commit SHA, Cloudflare deployment ID, build result, and completion timestamp are recorded.
- AC1 through AC9 must all be PASS in a fresh verification pass before the pull request may be merged. A FAIL, PARTIAL, UNKNOWN, missing external input, or unavailable account blocks the merge.

### AC10 — Production release and canonical-host behavior

- A pull request from codex/jq33-production-readiness-2026-07-29 to main contains only the intentional launch diff plus the required task proof artifacts; unrelated dirty or untracked user work is not staged.
- The pull request is merged only after AC1 through AC9 pass. Cloudflare Pages then deploys main automatically; no manual production upload occurs.
- The production deployment is traceable to the merged main commit. Its public HTML, crawl files, headers, routes, and required assets match a clean dist build of that commit.
- HTTP apex, HTTP www, and HTTPS www requests each reach the equivalent HTTPS apex canonical URL in one 301 while preserving the requested public path and query string. The three /home-page variants reach https://jq33.design/ in one 301. No canonicalization loop or multi-hop chain exists.
- The production deployment passes:

      $env:DEPLOYED_BASE_URL='https://jq33.design'
      $env:EXPECT_PRODUCTION='1'
      pnpm check:deployed

### AC11 — Production smoke, analytics, and search activation

- After production deployment, the homepage, projects index, all five project routes, Contact, Inquiry, robots.txt, sitemap.xml, one unknown route, and representative isolation routes return the expected statuses, content, canonicals, and security headers.
- One new uniquely tagged production Contact submission and one new uniquely tagged production Inquiry submission each report success and deliver exactly one message with no duplicate.
- The production Calendly action opens the intended direct event and still shows future availability.
- Cloudflare Web Analytics records a uniquely timestamped real page view for jq33.design after production deployment.
- https://jq33.design/sitemap.xml is submitted in the authorized Google Search Console property and is accepted without a blocking fetch error.
- All account/dashboard/inbox evidence is redacted to reveal only the minimum identifiers needed to correlate the result.

### AC12 — Rollback readiness and strict completion

- Before merging, record the currently active successful Cloudflare production deployment ID and confirm that it remains selectable as the rollback target.
- Roll back immediately if the production homepage is unavailable, portfolio routing loops or fails, CSP blocks required site assets or behavior, both forms fail globally, or persistent server errors occur. After rollback, rerun the affected production smoke checks and record the result.
- Non-global defects that do not meet a rollback trigger are fixed forward with the smallest safe diff and reverified.
- The task directory contains spec.md, evidence.md, evidence.json, raw command and redacted external evidence, and a fresh verifier verdict. problems.md is created only when verification is not PASS.
- A fresh verifier judges the current code and current local, preview, and production results. Any reproduced failure receives the smallest safe fix followed by rerunning every affected check.
- Completion requires AC1 through AC12 all PASS with zero FAIL, PARTIAL, or UNKNOWN. Preview success alone is not a production completion claim.

## Constraints and non-goals

- Preserve all unrelated tracked, dirty, and untracked user work. Inspect the staged path list before every commit; never stage the repository wholesale.
- Keep the site static-only and publish only dist. Do not deploy source files, Pages Functions, Supabase, admin code, CRM code, templates, or repository artifacts.
- Do not add pages, features, dependencies, custom deployment automation, release-attestation machinery, or visual refinements beyond a smallest fix for a reproduced acceptance failure.
- Use the existing canonical origin, route set, Montreal positioning, English content, concept-study disclosures, and current prices.
- Access to Formspree, Calendly, Cloudflare Pages/Analytics, GitHub, the destination inbox, and Google Search Console is an external prerequisite. Missing access is UNKNOWN and blocks the relevant gate; credentials must never be requested or transmitted in chat.
- French-language and broader legal compliance are explicitly outside this technical launch definition at the owner’s direction. No result from this task may be described as legal-compliance approval.

## Verification plan

1. Record the baseline status and protected unrelated paths; implement only the frozen launch diff.
2. Configure the two Formspree endpoints, Calendly event, Cloudflare Analytics token, and Cloudflare Pages Preview/Production settings through authorized accounts.
3. Run the pinned clean local install and pnpm verify with real public values; retain versions, logs, and dist manifest/check output.
4. Inspect the native Cloudflare preview and run pnpm check:deployed plus the route, isolation, form, Calendly, mobile, SEO, and security checks in AC5–AC9.
5. Run a fresh verifier. Merge only if every pre-production criterion is PASS.
6. Let Cloudflare deploy main, then run the production deployed check, form deliveries, Calendly, analytics, Search Console, canonical-host, isolation, and rollback-readiness checks.
7. Assemble minimal evidence and run a final fresh verifier. If the verdict is not PASS, write problems.md, apply the smallest safe fix, and repeat affected checks.

## Narrow assumptions

- The existing candidate branch and recorded baseline commit are the approved implementation starting point; later launch-only commits are expected.
- jq33-design-website is the existing Cloudflare Pages project named in repository configuration.
- The repository’s current 14 canonical sitemap routes are the complete launch surface.
- Public Formspree endpoint URLs, the Calendly event URL, and the Cloudflare Web Analytics token are build-time public values, not backend secrets; account credentials remain private.
- The owner will confirm or remove business claims and provide authorized account access or non-secret references needed for external verification.

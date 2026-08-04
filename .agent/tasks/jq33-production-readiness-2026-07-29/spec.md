# JQ33 Production Readiness Specification

Status: FROZEN  
Task ID: `jq33-production-readiness-2026-07-29`  
Frozen: 2026-07-29  
Canonical production origin: `https://jq33.design`  
Target locale: `en-CA`

## Original task statement

> Repository cwd is C:\Users\BELLWERK\Documents\PROJECTS\JQ33 DESIGN\WEB 2.0. Freeze the approved JQ33 Production Readiness task into `.agent/tasks/jq33-production-readiness-2026-07-29/spec.md` only. You own that spec file and no production code. Preserve all existing dirty worktree changes and do not modify anything else. Define numbered AC1–AC13 exactly covering: AC1 clean allowlisted dist/source-only URLs 404; AC2 static routes no loops, five known project 200, unknown 404, canonical redirects; AC3 honest unique local concept-study placeholders and disclosures, no remote fallbacks or fabricated proof; AC4 browser-comment visuals (self-host Lato body/UI, Permanent Marker headings and inquiry watermark, 30px buttons/form fields/panels/footer/trust, 20px project/content cards, full-bleed hero 0 radius behind transparent nav, remove inquiry Studio/map, proper social SVGs); AC5 responsive 320/375/414/768/1280x800/1440x900 no overflow/wrapped action labels/layout shift; AC6 separate Formspree contact/inquiry forms, native POST+JS, visible labels/validation/honeypot/spam config/aria-live/loading/success/error/timeout/retry/preserve values/duplicate prevention and exactly one tagged email per test; AC7 direct published Calendly event, tagged QA booking/cancel and validated social profiles only; AC8 valid HTML/a11y/axe/keyboard/focus/200%/reduced-motion/NVDA; AC9 SEO metadata/schema/sitemap/robots/lastmod/status/deployed-source parity; AC10 median 3 mobile Lighthouse runs performance>=90, a11y/BP/SEO>=95, LCP<=2.5s, CLS<=0.1, TBT<=200ms; AC11 security headers strict CSP no unsafe-inline, HSTS no preload/nosniff/referrer/permissions/frame deny, no secrets/dead Supabase/privacy traffic; AC12 Cloudflare Web Analytics/Search Console/DNS MX SPF DKIM DMARC; AC13 Node22 pnpm11.13 clean CI, same build artifact preview to automatic prod after all gates, proof loop current evidence no FAIL/PARTIAL/UNKNOWN. Constraints: static public site only; no admin/Supabase/CRM deployed; preserve dirty user work; remove root Pages Function/dynamic project shell; generate clean dist and set wrangler output; `/home-page` 301 to `/`; www one-hop apex; 404 real/noindex; en-CA only; canonical https://jq33.design; current five projects reframed as self-initiated concept studies; remove unsupported client/location/year/timeline/area/testimonials; no Unsplash; Cloudflare Analytics only; lead retention 12 months; no production deployment until every gate passes. Clearly mark external prerequisites (two Formspree endpoints in user's signed-in account, published Calendly URL + QA booking email, confirmed social URLs, Cloudflare/DNS/Search Console access) as required evidence, never waived. Completion requires zero FAIL/PARTIAL/UNKNOWN. Return exact path and brief summary.

## Objective

Prepare and prove a production-ready, static-only JQ33 DESIGN public site, then promote the exact verified artifact to Cloudflare production through the automatic deployment path. The work is complete only when every acceptance criterion below has current `PASS` evidence. A missing external credential, inaccessible account, unperformed live check, or unavailable result is `UNKNOWN` and blocks both production promotion and completion; it is never waived.

## Defined launch surface

The public HTML route allowlist is:

- `/`
- `/commercial-interior-design-montreal/`
- `/projects/`
- `/projects/bruton-place-iv/`
- `/projects/ethereal-gallery/`
- `/projects/obsidian-lounge/`
- `/projects/vortex-showroom/`
- `/projects/canvas-studios/`
- `/journal/`
- `/journal/reduction-as-creation/`
- `/contact/`
- `/inquiry/`
- `/privacy/`
- `/terms/`
- the real not-found document, served with status `404`

The distribution may additionally contain only the static assets and host-control files needed by those routes: self-hosted fonts, CSS, JavaScript, local images, favicons, raster social images, `robots.txt`, `sitemap.xml`, `_redirects`, and `_headers`. Any addition to the launch surface requires an explicit spec change before implementation.

The current project set is exactly these five slugs: `bruton-place-iv`, `ethereal-gallery`, `obsidian-lounge`, `vortex-showroom`, and `canvas-studios`.

## Acceptance criteria

### AC1 — Clean, allowlisted distribution and negative-route isolation

- A clean build creates a dedicated `dist/` from declared source inputs, without depending on files left by a previous build. `wrangler.toml` points `pages_build_output_dir` to that `dist/`.
- A generated manifest proves every file in `dist/` belongs to the defined launch surface or its permitted static/host-control assets. The output contains no repository guidance, task artifacts, package-manager metadata, build scripts, source data, templates, admin UI, Supabase code/config, Pages Functions, environment files, maps containing source content, or other development-only material.
- At minimum, deployed-preview requests for `/.agent/`, `/AGENTS.md`, `/CLAUDE.md`, `/.env`, `/.env.example`, `/package.json`, `/pnpm-lock.yaml`, `/wrangler.toml`, `/tasks.md`, `/DEPLOYMENT.md`, `/admin/`, `/data/projects.json`, `/scripts/build.mjs`, `/supabase/`, `/functions/`, `/projects/_project-template.html`, `/projects/_projects-index-template.html`, `/projects/project.html`, `/journal/_journal-template.html`, and `/journal/_journal-index-template.html` return a genuine HTTP `404`, never `200`, a soft-404 shell, a directory listing, or a redirect to public content.
- The repository-root Pages Function and dynamic project fallback shell are absent from the deployable artifact and cannot execute in preview or production.

### AC2 — Static route integrity, not-found behavior, and canonical redirects

- Every allowlisted HTML route is served statically. The project index and all five defined project URLs return direct HTTP `200` responses with the intended page, without a Pages Function, wildcard rewrite, client-side fallback, or repeated `Location` value.
- At least `/projects/not-a-project/`, a nested unknown project path, and an unknown root path return the branded not-found page with a genuine HTTP `404` and `noindex`; none resolve to the dynamic project shell or a `200` soft 404.
- Redirect and crawl tests detect loops and chains. A request may not revisit a URL, and every canonicalization completes in at most one redirect.
- `/home-page`, `/home-page/`, and `/home-page.html` each return `301` directly to `/`. `https://www.jq33.design/<path>` returns one `301` directly to the same path on `https://jq33.design`, with no intermediate hop. Legacy aliases and slash normalization, if retained, also resolve in one canonical hop.
- All final public URLs use HTTPS, the apex host, the `https://jq33.design` origin, and the sole `en-CA` locale.

### AC3 — Honest concept-study content and local visual assets

- All five current projects are consistently and prominently identified as self-initiated concept studies anywhere they appear, including project cards, project detail pages, accessible names/alt context where relevant, SEO metadata, and structured data.
- Each project uses its own visually distinct, locally stored concept-study placeholder/visual set. No project relies on the same generic placeholder as another, an Unsplash URL, another remote-image fallback, or a runtime request for missing imagery.
- Copy, captions, metadata, and schema contain no implication that a concept study is completed client work. Unsupported client, location, year, timeline, area, testimonial, outcome, award, partnership, or other proof claims are removed rather than generalized.
- No fabricated quotation, metric, attribution, engagement result, or provenance is introduced. A local-asset scan and browser network capture prove that all launch imagery resolves successfully from the verified artifact with no remote fallback.

### AC4 — Approved browser-comment visual corrections

- Body copy, navigation, forms, controls, and other UI text use self-hosted Lato files; no font is fetched from Google Fonts or another font CDN. Permanent Marker is used for display headings and the inquiry watermark as approved, with legible fallbacks and stable font loading.
- Buttons, form fields, general panels, footer containers, and trust panels use the approved `30px` corner radius. Project cards and other content cards use `20px`. Components do not silently substitute unrelated pill, square, or mixed radii.
- The homepage hero is full bleed, has `0` corner radius, and begins behind a transparent navigation layer without clipping, an unintended top gap, or an opaque header band.
- The Inquiry page’s Studio/map section is removed, including its markup, styling hooks, assets, links, and empty spacing.
- Every retained social link uses the correct brand SVG with an accessible name and visible focus state; emoji, text stand-ins, raster approximations, mislabeled glyphs, and generic icons are not accepted.
- Current browser-comment evidence is resolved at representative desktop and mobile widths, and comparison screenshots show the approved typography, geometry, hero/nav treatment, inquiry cleanup, and icons in the built artifact.

### AC5 — Responsive stability at the six approved viewports

- Fresh browser checks cover exactly `320x800`, `375x800`, `414x800`, `768x800`, `1280x800`, and `1440x900` on every distinct launch template and all interaction-bearing pages.
- At each viewport there is no document-level horizontal overflow, clipped required content, overlapping content, off-canvas focus target, broken grid, or obscured fixed/sticky UI.
- Navigation actions, buttons, submit states, booking links, card actions, footer actions, and other actionable labels remain on one readable line; labels are not truncated or made unreadably small to satisfy this requirement.
- Pages remain geometrically stable after self-hosted fonts, images, components, and validation/status messages settle. Screenshot and measurement evidence shows no user-visible late layout jump; the measured CLS requirement in AC10 also passes.

### AC6 — Reliable, accessible, non-duplicating Formspree submissions

- Contact and Inquiry are separate forms with two distinct production Formspree endpoints owned in the user’s signed-in Formspree account. Neither endpoint is a placeholder, shared endpoint, runtime fallback, or Supabase/CRM endpoint.
- Each form works as a standards-based native `method="post"` submission without JavaScript and as a progressively enhanced JavaScript submission when JavaScript is available. The native action and enhanced request target the same form-specific endpoint.
- Every control has a persistent visible label and correct programmatic association. Required fields, formats, errors, and summaries are validated accessibly; a honeypot is present; and account-side Formspree spam protection/configuration is evidenced.
- An `aria-live` status region communicates loading, success, error, and timeout states. The enhanced flow has a finite timeout, offers an explicit retry after recoverable failure, preserves all user-entered values until confirmed success, moves or exposes focus appropriately, and never reports success before a confirmed successful response.
- An in-flight lock and repeat-activation protection prevent duplicate requests from double-click, Enter-key repeat, retry races, or repeated event binding. Controls recover correctly after error or timeout.
- Deliverability evidence uses a unique QA tag for one valid Contact test and a different unique QA tag for one valid Inquiry test. Each test produces exactly one received email in the intended destination/account and zero duplicates; request logs, UI result, timestamp, tag, and redacted inbox receipt are correlated.
- The privacy notice and operating configuration state a maximum 12-month lead retention period and a deletion process. Missing endpoint/account access, spam settings, delivery receipts, or retention evidence is `UNKNOWN`, not waived.

### AC7 — Published booking target and confirmed social destinations

- Every consultation/booking action links directly to the same published Calendly event URL supplied by the user. No action points to a Calendly profile root, unpublished/draft event, placeholder, stale event type, fake confirmation, or locally simulated scheduler.
- A uniquely tagged QA booking is completed through the published event using the supplied QA booking email, the expected invite/confirmation is received, and the same booking is cancelled successfully with cancellation evidence. The production site must not create any additional booking from that test.
- Only user-confirmed social profile URLs are published. Each retained link resolves to the intended JQ33-controlled profile over HTTPS, has the correct brand SVG and accessible name, and is checked from the built preview; any unconfirmed, broken, redirected-to-login-only, placeholder, or mismatched profile is removed.
- The published Calendly URL, QA booking email, and confirmed social URLs are blocking external inputs and evidence. They cannot be inferred or waived.

### AC8 — Valid HTML and WCAG 2.2 AA interaction/accessibility proof

- Every allowlisted HTML document and the 404 document passes an HTML standards validator with no errors that affect parsing, semantics, relationships, IDs, forms, metadata, or accessibility.
- Axe runs on every distinct launch template, with drawers/dialogs, validation states, and other testable open states included, report zero critical or serious violations. Color, labels, names, roles, states, landmarks, headings, alternative text, and status messages meet WCAG 2.2 AA.
- A keyboard-only pass proves logical focus order, skip navigation, complete reachability/operation, no keyboard trap, correct drawer/dialog focus handling, and a clearly visible focus indicator for every interactive element.
- At browser zoom `200%`, content and functionality remain available without overlap, clipping, or two-dimensional scrolling except for intrinsically two-dimensional content (none is expected on this launch surface).
- `prefers-reduced-motion: reduce` removes non-essential animation, smooth scrolling, parallax, and delayed reveals without hiding content or blocking interaction.
- A manual NVDA pass on Windows covers navigation, headings/landmarks, project disclosure, Contact and Inquiry labels/errors/status/success, social links, and the Calendly action. Speech/transcript notes show that names, roles, states, errors, and live updates are understandable without visual context.

### AC9 — Accurate SEO, crawl files, status matrix, and source/deploy parity

- Every indexable route has a unique, accurate title and description, one canonical URL on `https://jq33.design`, `lang="en-CA"`, appropriate Open Graph/Twitter metadata using local assets, and no alternate-locale claim. The 404 and any non-indexable document have `noindex` and are excluded from the sitemap.
- Valid JSON-LD represents only supportable JQ33 organization/site/page/breadcrumb/project concept-study facts. It contains no removed client/location/year/timeline/area/testimonial or other fabricated proof, and schema validation returns no blocking errors.
- `sitemap.xml` contains exactly the canonical, indexable, HTTP-`200` launch URLs; it contains no redirects, 404s, source/template/admin paths, alternate hosts, query strings, or noncanonical URLs. Every `lastmod` is valid ISO format and traceable to an actual content modification rather than the build time alone.
- `robots.txt` is syntactically valid, references the canonical sitemap, permits intended public crawling, and does not expose or rely on robots rules to protect source/secrets.
- A machine-readable HTTP status matrix verifies all allowlisted routes, redirects, and negative routes in preview and production. Production HTML, assets, metadata, crawl files, headers, and route behavior are proven to come from the same immutable artifact/source revision that passed preview, using recorded commit/deployment IDs and checksums.

### AC10 — Repeatable mobile Lighthouse performance budget

- Each indexable launch URL is audited with Lighthouse mobile settings three times against the same production-candidate preview artifact under controlled, recorded conditions. Raw `.lhr.json` files are retained for all runs.
- For each URL, the median of its three runs is: Performance `>= 90`, Accessibility `>= 95`, Best Practices `>= 95`, SEO `>= 95`, LCP `<= 2.5s`, CLS `<= 0.1`, and TBT `<= 200ms`.
- A median is computed per URL and metric from three successful runs; scores may not be pooled across URLs, and a failed/missing run is `UNKNOWN` until rerun. No fastest-run selection, disabled audit, threshold rounding, or lab-data substitution is accepted.
- Production parity smoke evidence confirms the promoted immutable artifact has no material regression in asset delivery, console errors, or Core Web Vitals inputs.

### AC11 — Security headers, secret exclusion, and privacy-safe runtime

- Every HTML response, including 404 responses, has a strict Content-Security-Policy tailored to the actual static site integrations, with neither `'unsafe-inline'` nor `'unsafe-eval'`; framing is denied with `frame-ancestors 'none'` and `X-Frame-Options: DENY`.
- HTTPS responses include HSTS with at least `max-age=31536000` and `includeSubDomains` but no `preload`, plus `X-Content-Type-Options: nosniff`, a restrictive `Referrer-Policy`, and a least-privilege `Permissions-Policy`. Header syntax and effective browser behavior are tested on preview and production, not inferred from source files.
- Tracked files and the clean `dist/` pass secret and sensitive-file scanning. No service-role key, private token, endpoint credential, personal QA address, unpublished integration URL, source map containing secrets, or environment file is shipped.
- No public page loads or calls dead Supabase/admin/CRM code. Browser network and console captures show no Supabase traffic and no undocumented analytics, pixels, session replay, fingerprinting, advertising, or other privacy traffic.
- Cloudflare Web Analytics is the only analytics product. Before user action, third-party traffic is limited to the necessary Cloudflare analytics beacon; Formspree traffic occurs only on form submission, Calendly/social navigation occurs only on activation, and no remote font/image fallback occurs.
- The production privacy disclosure accurately names the data flows, purposes, processors, user choices, contact route, and maximum 12-month lead-retention/deletion practice. Security or privacy evidence that cannot be observed is `UNKNOWN`.

### AC12 — Cloudflare analytics, search ownership, and mail DNS readiness

- Cloudflare Web Analytics is enabled for `jq33.design`, is the only analytics integration in source/network evidence, and records a uniquely timestamped QA page view in the correct site dashboard after consent/disclosure requirements are satisfied.
- The apex domain is verified as a Google Search Console domain property under the authorized account. The canonical sitemap is submitted successfully, fetchable, and shows no blocking submission error; ownership and submission evidence is current and redacted.
- Authoritative DNS evidence for the apex and mail service shows intended MX records, exactly one syntactically valid SPF policy, a valid published DKIM key for the active sender, and a valid DMARC record with the owner-approved policy/reporting configuration.
- A tagged QA message through the actual domain mail path has headers showing SPF, DKIM, and DMARC all pass with alignment appropriate to the configured sender. DNS propagation is checked from more than one public resolver.
- Cloudflare, authoritative DNS/mail-provider, and Search Console access are mandatory external prerequisites. Missing access, pending propagation, absent mail-header proof, or a dashboard that cannot be inspected is `UNKNOWN` and blocks promotion/completion.

### AC13 — Reproducible CI, immutable promotion, and complete proof loop

- CI runs on Node.js 22 and pnpm `11.13.0`. A clean-checkout job activates that exact pnpm version, installs with the frozen lockfile, builds a fresh `dist/`, and runs all repository launch checks plus the route, browser, accessibility, Lighthouse, security, and artifact-manifest gates defined above.
- CI does not reuse an unverified workspace, stale `dist/`, mutable dependency resolution, or locally generated secret. The current source revision, lockfile hash, Node/pnpm versions, commands, timestamps, and complete logs are recorded.
- The preview deployment consumes the single CI-produced immutable `dist/` artifact. Only after every pre-promotion requirement in AC1–AC12 is `PASS` may the automatic production job promote that exact artifact; production may not rebuild, modify, or independently regenerate it.
- The proof loop creates current `evidence.md`, `evidence.json`, and raw artifacts under `.agent/tasks/jq33-production-readiness-2026-07-29/`, then runs a fresh verifier against the current code, external evidence, preview, and promoted production. If any check is not `PASS`, `problems.md` is written, the smallest safe fix is applied, all affected checks are rerun, and the fresh verdict replaces stale evidence.
- The production promotion is not authorized while any pre-promotion result is `FAIL`, `PARTIAL`, or `UNKNOWN`. After immutable promotion, read-only production smoke/parity capture must also pass before completion is claimed.
- Final completion requires AC1 through AC13 all `PASS`, with exactly zero `FAIL`, zero `PARTIAL`, and zero `UNKNOWN`. External prerequisites, manual accessibility checks, inbox/booking evidence, DNS propagation, dashboard evidence, and production parity are never marked `N/A` or waived.

## Blocking external prerequisites

The following must be supplied or accessed by an authorized user and evidenced in the proof loop. Their absence is a blocking `UNKNOWN`, never a waiver:

1. Two distinct production Formspree endpoints created in the user’s signed-in account: one for Contact and one for Inquiry, plus access to endpoint spam settings and the destination inbox needed to prove one tagged delivery per test.
2. The direct URL of a published Calendly event and a designated QA booking email, plus access needed to confirm and cancel the tagged QA booking.
3. User-confirmed canonical URLs for every social profile that may remain on the site.
4. Authorized Cloudflare Pages/Web Analytics and authoritative DNS access, mail-provider evidence needed for MX/SPF/DKIM/DMARC, and Google Search Console domain-property access.

Credentials, private tokens, and the QA email must be injected through approved secret/account mechanisms and redacted from repository artifacts and screenshots.

## Constraints

- The deployable product is a static public site only. Do not deploy admin, Supabase, CRM, API, database, or server-side application functionality.
- Remove the repository-root Pages Function and dynamic project shell from the deployment path. Static files and host redirect/header rules are the only allowed runtime.
- Generate a clean dedicated `dist/` and configure Wrangler to deploy it. Do not deploy the repository root.
- Preserve all pre-existing dirty-worktree changes. Do not reset, discard, overwrite, or reformat unrelated user work; implementation must make the smallest scoped changes required by AC1–AC13.
- Keep the sole locale `en-CA` and the sole canonical origin `https://jq33.design`.
- `/home-page` variants redirect `301` to `/`; `www` redirects to the apex in one hop; the branded 404 is a real HTTP `404` with `noindex`.
- Treat the five named projects only as self-initiated concept studies. Remove unsupported client, location, year, timeline, area, testimonial, outcome, and similar proof claims.
- Use no Unsplash or other remote image fallback. Required launch images and fonts are local.
- Use Cloudflare Web Analytics only; do not add another analytics, ad, tracking, replay, or fingerprinting service.
- Enforce a maximum 12-month lead retention practice and disclose it accurately.
- Do not trigger production deployment until all pre-promotion gates and blocking external prerequisites are `PASS`. Completion additionally requires the immutable production parity checks to pass.

## Non-goals

- Building, repairing, or deploying an admin portal, Supabase backend, CRM, CMS, database, API, or dynamic project router.
- Creating fictional portfolio proof, testimonials, client identities, locations, dates, dimensions, results, awards, or case-study metrics.
- Adding locales, alternate domains, a new brand system, unrelated pages, new marketing integrations, or non-Cloudflare analytics.
- Replacing the five concept studies with claimed client work or sourcing remote stock photography.
- Waiving external/account/manual checks, treating preview-only success as production completion, or deploying a separately rebuilt artifact.
- Refactoring unrelated dirty-worktree code or changing user work outside the minimum production-readiness scope.

## Narrow assumptions

1. “Current five projects” means the five slugs listed in the Defined launch surface section, as confirmed by the current `data/projects.json`.
2. “Source-only URLs 404” means direct HTTP requests against the built preview/production, not merely absence from navigation; the minimum negative matrix is fixed in AC1 and may be expanded if implementation exposes another source-only path.
3. “No production deployment until every gate passes” means every result that can be completed before promotion, including all blocking external prerequisites and preview parity checks, must be `PASS`. The automatic production promotion then reuses the already verified immutable artifact; its read-only live status/parity capture is the final closure step and cannot be waived.
4. “Validated social profiles” means URLs explicitly confirmed by the user and observed to resolve to the intended controlled profile. The implementer must remove, not guess, a profile when confirmation is unavailable.
5. “Layout shift” is evaluated both visually after all late-loading resources settle and quantitatively through the per-route CLS threshold in AC10.
6. The 12-month retention requirement is a maximum duration, not a promise that every lead is retained for the full period.

## Verification plan

All outputs must identify the source commit, immutable artifact checksum, preview/production deployment IDs, timestamp, tool version, target URL, and result. Secrets and personal data must be redacted.

1. **Clean toolchain and artifact:** In a clean Node 22 checkout, run `corepack prepare pnpm@11.13.0 --activate`, `pnpm install --frozen-lockfile`, the production build, and the complete launch/CI suite. Record a recursive `dist/` manifest and checksum; reject any file outside AC1’s allowlist.
2. **Routes and redirects:** Serve/deploy only `dist/`; run an HTTP matrix for every allowlisted route, all five project routes, unknown paths, source-only paths, `/home-page` variants, HTTP/HTTPS host variants, and legacy aliases. Record every hop, final status, canonical, content type, robots directive, and loop detection.
3. **Content and assets:** Scan rendered/source text, metadata, and JSON-LD for concept-study disclosures and prohibited proof claims. Inventory image/font URLs, hash local assets, block remote/Unsplash fallbacks, and retain browser network logs showing successful local delivery.
4. **Visual and responsive browser pass:** Capture full-page and focused component screenshots for each distinct template at all six AC5 viewports after fonts/images settle. Measure scroll width, action-label wrapping, bounding-box collisions, and late layout movement; compare the approved browser-comment areas.
5. **Forms and booking:** Test native no-JS and enhanced form paths, validation, keyboard behavior, live regions, loading/success/error/timeout/retry, value preservation, and double activation. Perform only the two uniquely tagged deliverability submissions and correlate exactly one email each. Complete and cancel one tagged Calendly booking using the supplied QA address.
6. **Accessibility:** Validate all HTML, run axe on normal and relevant open/error/success states, complete keyboard and 200% zoom matrices, emulate reduced motion, and record a manual NVDA transcript/checklist.
7. **SEO and status:** Validate metadata, canonicals, `en-CA`, local social images, JSON-LD, sitemap membership/`lastmod`, robots, 404 `noindex`, and preview/production status. Compare source revision, artifact hashes, and Cloudflare deployment identifiers for parity.
8. **Lighthouse:** Run three successful Lighthouse mobile audits per indexable route under controlled conditions, preserve every raw report, calculate medians per route/metric, and evaluate all AC10 thresholds without rounding.
9. **Security and privacy:** Scan tracked files and `dist/` for secrets/sensitive paths; probe effective response headers; inspect browser console/network traffic before and after user actions; confirm no Supabase/admin/CRM code or undocumented privacy traffic; verify the privacy/retention disclosure.
10. **External services:** Capture redacted, timestamped evidence from Formspree, Calendly, Cloudflare Web Analytics, authoritative DNS/mail provider, public resolvers, mail authentication headers, and Search Console. Unavailable access or pending results remain `UNKNOWN`.
11. **Proof-loop closeout:** A fresh verifier reruns current checks and assigns one result to each AC. Any non-`PASS` result produces `problems.md` and a minimal repair/reverification cycle. Automatic production promotion is permitted only after the pre-promotion matrix is all `PASS`; final closure requires production smoke/parity and a zero-`FAIL`/`PARTIAL`/`UNKNOWN` verdict.

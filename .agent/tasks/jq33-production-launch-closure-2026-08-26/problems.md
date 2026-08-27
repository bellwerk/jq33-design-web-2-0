# JQ33 production launch closure — unresolved verification gates

## 2026-08-26 immutable-preview Lighthouse failure and corrective rerun

- **Exact preview:** commit `69b9685575eb1b5cd227ec21d077157ec8978356`, deployment `3c2acf26-db28-4be7-881e-687555d84248`, immutable host `3c2acf26.jq33-design-website.pages.dev`.
- **Passing deployed gates:** the 140-record HTTP/byte/source-isolation matrix, production-health monitor logic, and the complete 308-test browser suite passed with zero byte mismatches or browser failures.
- **AC2 failure:** the first 42-report Lighthouse set failed the frozen threshold. Homepage median LCP was `2913.8415ms`; `/commercial-interior-design-montreal/` median CLS was `0.1380135593855402`; and every route scored SEO `69` because Cloudflare injected `x-robots-tag: noindex` on the immutable preview deployment.
- **Reproduction:** summarize the retained raw reports from the first immutable preview and inspect `is-crawlable`, `lcp-breakdown-insight`, and `layout-shifts`. The homepage LCP candidate is `#brand-mark-text`; the service-page shift is the hero action group after the public Lato and Permanent Marker faces load.
- **Expected vs actual:** expected median LCP at or below `2500ms`, CLS at or below `0.1`, and SEO at or above `95`; the observed medians and platform header do not meet those limits.
- **Smallest source correction:** give each already-preloaded Permanent Marker subset a route-specific font-family name and bind only its intended hero text to that name. This removes ambiguous same-family face selection without changing glyph bytes, typography, assets, dependencies, copy, or layout. Add route-local Lato preloads only if a corrective three-run capture still attributes residual CLS to those faces.
- **Platform constraint:** the Pages preview `noindex` header is not emitted by the sealed artifact. Do not weaken the site's production crawl controls or falsify the Lighthouse result. The SEO preview threshold remains unresolved unless a Cloudflare-supported immutable hostname without the injected preview header is authorized and proven.
- **Required rerun:** rebuild with the pinned strict toolchain; run local targeted performance diagnostics, the complete local verifier, a fresh native Pages preview, and the entire deployed 42-report Lighthouse set. Preserve this failed set and all corrective results.

## 2026-08-26 replacement-preview residual homepage LCP

- **Exact preview:** commit `cd15d3e0c8e91cdfeca925f06b85139d11df10d9`, deployment `a320c324-0ed4-44c1-b915-9d45029739b0`, immutable host `a320c324.jq33-design-website.pages.dev`.
- **Passing corrective evidence:** exact deployed/local byte parity passed `134/134`, the 140-record deployed matrix and 12-record health check passed with zero failures, the full deployed browser suite passed `308/308`, the service-page median CLS corrected from `0.1380135593855402` to `0`, and every non-home route met the frozen performance, LCP, CLS, and TBT budgets.
- **Residual AC2 failure:** the replacement 42-report Lighthouse set measured homepage median LCP at `2820.5862ms`; its LCP element remains `#brand-mark-text`. The three homepage LCP values were `2962.9105ms`, `2792.666ms`, and `2820.5862ms`.
- **Platform constraint preserved:** every preview route still scores SEO `69` solely because Cloudflare injects `x-robots-tag: noindex` on preview hosts. The sealed artifact does not emit that header, and the production crawl policy must not be weakened to falsify preview evidence.
- **Smallest second correction:** embed the already-generated `permanent-marker-home.woff2` subset as a data URL in the homepage critical CSS and remove only its redundant external preload. This keeps the exact approved glyph bytes and typography while removing the remaining font request; pruning may then omit the unreferenced external subset from `dist/`. Explicitly add `data:` only to `font-src` in the generated CSP and its exact production-health contract; all style execution remains same-origin or hash-authorized.
- **Required rerun:** rebuild and verify the exact correction with the pinned toolchain, deploy a new immutable native-Git preview, and rerun byte parity, the complete browser suite, and all 42 mobile Lighthouse captures. Preserve this failed set unchanged.

## 2026-08-26 first pinned verification attempt for the embedded-font commit

- **Exact commit:** `dbc0b79ea2de9af160dfc79837c1a8c0ab613b8e` in a detached clean worktree using Node `22.23.2`, pnpm `11.13.0`, a frozen install, and sealed production integration values.
- **Passing portion:** the strict 111-file build, artifact validation, frontend/static/security/SEO checks, and 308 browser tests passed before the attempt terminated.
- **Retained failure:** `/journal/reduction-as-creation/` at `414x800` could not begin navigation because Chromium returned `net::ERR_NO_BUFFER_SPACE`. This was an infrastructure transport failure rather than an assertion or candidate-response failure, but the suite is not PASS and must not be waived as a flake.
- **Review hardening:** independent review found no preview blocker and one non-blocking fail-closed gap: the generated CSP replacement was not asserted locally. Add an exact `font-src 'self' data:` assertion in both the build and distribution checker before the next sealed attempt.
- **Required rerun:** commit the smallest two-check hardening, create a new detached clean worktree, and rerun the entire pinned strict verifier. Completion requires all 309 browser records to finalize successfully with no retry or unexpected result.

## 2026-08-26 third immutable-preview residual text LCP

- **Exact preview:** commit `364614b583dabc110913ef2b631d41652a0027d6`, deployment `2247a1a6-b53a-42db-b430-f32962e85511`, immutable host `2247a1a6.jq33-design-website.pages.dev`.
- **Passing gates:** the sealed pinned build and audits passed; deployed parity passed all `139` records with `0` byte mismatches; production health passed; the deployed browser suite passed `309/309`; genuine Chrome 200% zoom showed no horizontal overflow across ten distinct templates and the drawer, native/custom FAQ, and validation states; the published Calendly event opened without booking.
- **Residual AC2 failure:** the complete 42-report set measured homepage median LCP `2776.8098ms` and service-route median LCP `2623.0555ms`. Every other candidate-controlled performance, accessibility, best-practices, layout-shift, and blocking-time budget passed. Preview SEO remained `69` solely because Cloudflare injected `x-robots-tag: noindex`.
- **Corrected trace diagnosis:** all six observed LCP timestamps equal observed FCP; the apparent `1050–1200ms` gap exists only in Lighthouse Lantern simulation. Lantern includes non-low-priority-image requests that completed before observed LCP, making full-font requests cross the cutoff inconsistently. Home runs always included the `50030`-byte Inter transfer and sometimes included `24–25KB` Lato weights; two slow service runs included the hero image plus roughly `94KB` of full Lato/Permanent Marker fonts.
- **Rejected experiment:** route-scoped `font-display:block` was tested only in an uncommitted fixture build. Three local mobile captures still produced home median LCP `2670.9ms`; the mode did not remove graph requests, risked invisible text, and would fail Lighthouse's Font Display insight. The experiment was reverted in full.
- **Smallest third correction:** preserve the exact font outlines, weights, text, and layout while reducing graph bytes. Generate a route-only subset from the existing `48256`-byte variable Inter source for the static home panel, retain `swap`, and preload only that subset. Inline the existing `4016`-byte commercial H1 subset and remove its redundant external preload. The full shared fonts remain byte-identical and available elsewhere.
- **Review correction:** the first local subset used raw mixed-case HTML and omitted glyphs introduced by CSS `text-transform:uppercase`; CDP platform-font evidence found Lato fallback in the subheadline and secondary action. The unpushed candidate was corrected by adding the transformed glyph inventory, producing an `18696`-byte subset, and the browser contract now checks actual platform glyph usage for every transformed home text class with zero non-Inter fallback.
- **Local correction proof:** the combined browser contract passes: the home subset loads once with no full Inter request or platform fallback, and the service H1 uses the embedded exact face with no external request. Three fresh post-review mobile captures measured home LCP `2373.1ms` median and service LCP `1882.6ms` median; performance scores were at least `95`, TBT at most `90ms`, and CLS at most `0.07`.
- **Dirty-tree verifier interruption:** the precommit fixture launch passed frontend, links, images, distribution, redirects, project routes, content, forms, and HTML, then the secret scanner's `git` enumeration hit `spawnSync git ENOBUFS` on the large user-owned untracked proof inventory. No product assertion failed. A separate fresh browser run passed `309/309`; the required authoritative strict verifier remains the detached clean-worktree run.
- **Required rerun:** run the pinned strict verifier, deploy a fresh native-Git immutable preview, and repeat parity, deployed browser, and all 42 Lighthouse captures. Preserve this failed set and do not substitute a selective rerun.

## 2026-08-26 fourth immutable-preview residual font-repaint LCP

- **Exact preview:** commit `0ce0e023b50bb0d4146fad2e116b91fcb18122bf`, deployment `4aa8d2c6-11e4-405f-8a68-ac72c51aa3f2`, immutable host `4aa8d2c6.jq33-design-website.pages.dev`.
- **Passing gates:** the pinned clean strict build produced `111` allowlisted files; production and full dependency audits reported no known vulnerabilities; the complete local browser suite passed `309/309`; deployed byte/status/source-isolation parity passed `139/139`; production-health logic passed `12/12`; and the exact deployed browser suite passed `309/309` with zero flakes, skips, or unexpected results. GitHub Release Gate run `33025571600` completed successfully with the same `309/309` first-attempt browser result.
- **Retained AC2 failure:** isolated Lighthouse attempt 02 captured all `42` required reports. The homepage median LCP was `2895.5536ms` (`2872.12`, `2907.9542`, `2895.5536`), and the commercial-route median was `2750.4286ms` (`2753.1108`, `2750.4286`, `1125.0659`). The other twelve routes met every candidate-controlled budget; all routes scored performance at least `94`, accessibility and best practices `100`, median TBT `0`, and median CLS at most `0.0731`.
- **Exact root cause:** both failing LCP nodes are text. Every homepage result was simulated FCP plus exactly `1050ms`; the two median-forming commercial results were simulated FCP plus exactly `900ms`. Observed FCP and LCP were equal, the route subsets were embedded and decoded before first paint, render-blocking savings were zero, and TBT was zero. Those fixed post-FCP windows are the `font-display: swap` repaint model, not image, script, layout, or server delay.
- **Smallest fourth correction:** at build time only, change the embedded `Permanent Marker Home` face and embedded `Permanent Marker Commercial H1` face to `font-display: optional`, retaining the exact font bytes, typography, bindings, content, layout, assets, and dependency graph. Add fail-closed distribution assertions. The source `assets/css/home-font.css` remains unchanged because it is outside this task's frozen allowlist.
- **Rejected fourth experiment:** two uncommitted six-run local matrices disproved that correction before release. `font-display: optional` produced home median LCP `2928.0262ms` and commercial median `2776.6603ms`; additionally removing the full Permanent Marker face from each LCP-specific fallback chain changed those medians by only `-0.1624ms` and `-0.1167ms`. CLS and TBT remained zero and the font-display audit passed, but the fixed simulated repaint gaps remained about `1276ms` and `1125ms`. These experiments must be reverted rather than promoted.
- **Rejected SVG isolation experiment:** a temporary self-contained SVG image replaced the homepage visual LCP while keeping its exact `166x343` geometry and removing the route font from the page network graph. Lighthouse correctly changed the LCP node to `img.brand-mark__svg`, but measured FCP `1651.454ms` and LCP `2928.2715ms`, effectively identical to the rejected optional-font result. This disproves route-glyph decode as the blocker and rules out vectorizing visible text as an accessibility/design-costly metric workaround.
- **Rejected route-wide inline experiment:** temporary exact Lato `400/700/900` and Permanent Marker subsets eliminated every external font request on the commercial route and left only the existing home Inter request. The added base64 expanded the documents by about `80KB`; first runs measured home LCP `2926.182ms` and commercial LCP `2551.2495ms`. Exact outlines and zero CLS/TBT were preserved, but both routes still failed and the home result did not improve. Do not promote the inline variant.
- **Rejected route-wide external experiment:** preloading those same exact subsets as external WOFF2 files kept documents small and removed all global Lato/Marker requests. It improved FCP to roughly `946ms`, but first-run LCP still measured `2777.04ms` on home and `2626.20ms` on commercial. Loading every page face before the observed hero paint kept those requests in Lighthouse's LCP model; early preloading alone is insufficient.
- **Release-gate diagnostic retained:** an earlier transient narrow-viewport image movement was traced to the intentional footer parallax transition and is reproducible only when a synthetic mousemove lands immediately before sampling. The authoritative rerun passed without retry or flake, so no parallax source change is justified for the sealed candidate.
- **Platform SEO constraint unchanged:** every preview route's raw SEO score remains `69` solely because Cloudflare automatically injects `X-Robots-Tag: noindex` on native Pages preview deployments. Candidate-controlled SEO audits are all passing. The literal preview SEO threshold still requires an owner-authorized spec refreeze; the artifact must not remove or bypass the platform safeguard.
- **Required rerun:** first prove the font policy with three isolated local mobile captures on both routes and the pinned verifier. If it passes, commit only the allowlisted correction and this retained history, deploy a new immutable native-Git preview, then rerun exact parity, all browser checks, and the full non-overlapping `42`-report Lighthouse matrix.

Historical baseline verdict: **UNKNOWN** at exact commit `1523a086618c5dea365477032b6ac73a7a867862`. Current task status remains **OPEN / AC2 FAIL** because the newest immutable preview is the retained failed `4aa8d2c6` deployment; the corrected local candidate cannot change that verdict until a fresh commit-bound preview passes all `42` Lighthouse captures. The remaining criteria stay UNKNOWN until their required deployed, human, provider, approval, promotion, production, or durability proof exists.

## AC2 — Non-visual performance closure

- **Criterion:** AC2 — Non-visual performance closure.
- **Status:** UNKNOWN.
- **Why not proven:** Local static performance contracts pass, but no immutable-preview Lighthouse set exists.
- **Minimal reproduction:** Inspect this task's raw evidence for three simulated-mobile Lighthouse reports per public route, all bound to an immutable preview of `1523a08…`.
- **Expected vs actual:** Expected the complete bound matrix meeting every frozen median budget; actual is no qualifying preview report.
- **Affected files:** Performance/build paths listed in the frozen spec, the future preview, and this task packet.
- **Smallest safe fix:** After AC6 creates the exact preview, capture and summarize the required Lighthouse matrix without changing release bytes.
- **Corrective hint:** Bind every report to commit, deployment, artifact, and time. Local static checks cannot replace deployed measurements.

## AC3 — Strict build contract and dependency hygiene

- **Criterion:** AC3 — Strict build contract and dependency hygiene.
- **Status:** UNKNOWN.
- **Why not proven:** Exact pinned strict builds, audits, and local artifact isolation pass, but genuine deployed 404/source-isolation behavior is absent.
- **Minimal reproduction:** Probe every frozen excluded source/admin/workflow path on an immutable preview and retain the HTTP status/body classification.
- **Expected vs actual:** Expected clean artifact proof plus genuine preview 404s; actual proves only the local artifact side.
- **Affected files:** `scripts/build.mjs`, `scripts/check-dist.mjs`, `package.json`, `pnpm-lock.yaml`, the immutable preview, and this task packet.
- **Smallest safe fix:** Run the existing deployed source-isolation/status matrix against the AC6 preview and retain sanitized results.
- **Corrective hint:** Require real 404 responses, not redirects or branded 200 pages. Do not log integration values.

## AC4 — Minimal release and runtime safeguards

- **Criterion:** AC4 — Minimal release and runtime safeguards.
- **Status:** UNKNOWN.
- **Why not proven:** Workflow contracts and health self-tests pass, but protected `main` and a successful production monitor execution are unproven.
- **Minimal reproduction:** Read current branch-protection settings and inspect workflow history for a successful production smoke run bound to the promoted commit.
- **Expected vs actual:** Expected strict required checks, conversation resolution, force-push/deletion blocks, rollback bypass documentation, and a successful real monitor run; actual contains implementation/self-test proof only.
- **Affected files:** `.github/workflows/release-gate.yml`, `.github/workflows/production-smoke.yml`, `scripts/check-production-health.mjs`, `DEPLOYMENT.md`, repository settings, and this task packet.
- **Smallest safe fix:** At the authorized phases, enable/read back the frozen protection settings and retain one successful production smoke result.
- **Corrective hint:** Keep self-test and real production monitoring as separate evidence. Do not mutate repository settings before the required checks are available.

## AC6 — Exact immutable preview

- **Criterion:** AC6 — Exact immutable preview.
- **Status:** UNKNOWN.
- **Why not proven:** No native Cloudflare Pages preview is bound to exact commit `1523a08…`.
- **Minimal reproduction:** Inspect the packet for deployment ID, immutable URL, commit/artifact binding, deployed-byte parity, HTTP/crawl/browser/accessibility results, and Lighthouse results.
- **Expected vs actual:** Expected one successful native-Git immutable preview and the complete frozen preview matrix; actual has exact local proof only.
- **Affected files:** The 38-path release candidate, native Pages integration, and this task packet.
- **Smallest safe fix:** Push the verified commit through the existing native integration, identify its immutable deployment, and run the frozen preview checks.
- **Corrective hint:** Do not use a mutable alias, manual upload, or retired preview. Reverify if any release byte changes.

## AC7 — Human, provider, and preview conversion proof

- **Criterion:** AC7 — Human, provider, and preview conversion proof.
- **Status:** UNKNOWN.
- **Why not proven:** Genuine Chrome 200% zoom, Windows NVDA, provider readbacks, approved preview form deliveries, and Calendly-open proof are absent.
- **Minimal reproduction:** Inspect for human/NVDA records, provider ownership/control evidence, immediate owner approval tags, exactly-one delivery receipts, failure/retry behavior, and non-booking Calendly evidence bound to AC6.
- **Expected vs actual:** Expected the full frozen human/provider/preview conversion matrix; actual is automated local proof with zero submissions.
- **Affected files:** Public form/scheduling/navigation routes, authorized provider accounts, the AC6 preview, and this task packet.
- **Smallest safe fix:** After AC6, obtain each action-time approval and execute only the frozen synthetic human/provider checks, retaining redacted evidence.
- **Corrective hint:** Never infer provider behavior from local mocks. Do not submit forms or mutate providers without immediate approval.

## AC8 — Controlled promotion through PR #1

- **Criterion:** AC8 — Controlled promotion through PR #1.
- **Status:** UNKNOWN.
- **Why not proven:** AC2–AC7 are not all PASS, and rollback-target, immediate merge approval, PR merge, and automatic production-deployment proof are absent.
- **Minimal reproduction:** Confirm AC1–AC7 all PASS, a selectable successful rollback deployment, owner approval at action time, PR #1 merge identity, and native Pages production deployment identity.
- **Expected vs actual:** Expected controlled promotion of the exact proven candidate; actual remains pre-preview with promotion disallowed.
- **Affected files:** PR #1, repository/Pages deployment state, rollback evidence, and this task packet.
- **Smallest safe fix:** Complete AC2–AC7, record the rollback target, then obtain immediate owner approval and use only the frozen PR procedure.
- **Corrective hint:** Keep promotion blocked until every prerequisite is current and exact. A local PASS is not merge authority.

## AC9 — Production, DNS, mail, analytics, and search closure

- **Criterion:** AC9 — Production, DNS, mail, analytics, and search closure.
- **Status:** UNKNOWN.
- **Why not proven:** No authorized production promotion exists, so production bytes/runtime, DNS/mail, analytics, form delivery, monitoring, and Search Console gates are unproven.
- **Minimal reproduction:** Inspect for merged-commit/deployment parity, complete production HTTP/browser checks, authorized form and analytics evidence, authoritative/public resolver DNS-mail results, aligned mail headers, monitor results, and approved sitemap submission.
- **Expected vs actual:** Expected every frozen production/provider gate bound to the promoted commit; actual has none for this candidate.
- **Affected files:** Production deployment, custom-domain/DNS/mail/analytics/search provider state, monitoring workflow, and this task packet.
- **Smallest safe fix:** After AC8 and each immediate approval, execute the frozen production sequence in order and retain only redacted evidence.
- **Corrective hint:** Do not infer production health from local or preview proof. Preserve rollback readiness and stop at every approval gate.

## AC10 — Durable independent all-PASS closure

- **Criterion:** AC10 — Durable independent all-PASS closure.
- **Status:** UNKNOWN.
- **Why not proven:** Eight criteria remain UNKNOWN, and no final evidence-only PR or active recurring production-monitor proof exists.
- **Minimal reproduction:** Parse `verdict.json`, require AC1–AC10 all PASS, then verify the final packet is durable on `main` without changing the public artifact and that production monitoring is active.
- **Expected vs actual:** Expected ten PASS results and durable final proof; actual is 2 PASS, 0 FAIL, and 8 UNKNOWN.
- **Affected files:** This task packet, final evidence-only PR, `main`, and production monitoring records.
- **Smallest safe fix:** Complete the unresolved criteria in sequence, refresh exact bindings, and run another fresh independent final verification before the evidence-only PR.
- **Corrective hint:** Do not archive, promote, or claim completion while any criterion is UNKNOWN. Final verification must judge current external state, not this pre-preview packet.

## 2026-08-27 AC11 shared-footer corrective history

- **Immutable design reference:** the approved Projects footer was read from commit `364614b583dabc110913ef2b631d41652a0027d6`, Cloudflare Pages deployment `2247a1a6-b53a-42db-b430-f32962e85511`, at `https://2247a1a6.jq33-design-website.pages.dev/projects/`. This binding remains the appearance baseline; it is not evidence that the current local candidate has been deployed.
- **Initial authoritative-suite failure retained:** the first complete local run finalized `309` expected and `6` unexpected tests. The six defects were three serious Contact footer color-contrast failures (default, validation, and provider-error/retry states), one Projects typography-contract failure caused by treating the new shared Lato footer as Projects content UI, and one actionable-overlap failure each on Journal and Inquiry. Raw result: `raw/local/footer-ac11-full-browser/results.sanitized.json`.
- **Smallest targeted corrections:** the footer foreground was raised to the approved brighter cobalt over the dark-grain surface; the Projects content-typography assertion was scoped to exclude the genuinely shared footer; the Journal and Inquiry footer mounts were moved outside their constrained scroll/grid containers; and Inquiry's containing rows were allowed to size to content. Targeted reruns also corrected two test-only assumptions—the exact reference surface is `#1A1A1A`, and computed single-track `minmax(...)` grids must count as one column—before confirming the Inquiry geometry and the six-width footer contract. Retained portable sequence: `raw/local/footer-ac11-targeted-rerun/results.sanitized.json`, `raw/local/footer-ac11-targeted-rerun-02/results.sanitized.json`, and `raw/local/footer-ac11-targeted-rerun-03/results.sanitized.json` (`7/7` PASS in the last run).
- **Transient Terms result retained:** the next complete rerun finalized `314/315`; only the Terms skip-link focus check lost a navigation race. Three immediate isolated executions passed `3/3`, establishing that the failure was transient rather than a reproducible Terms/footer defect, but it was not used as a substitute for a fresh complete run. Portable results: `raw/local/footer-ac11-full-browser-rerun/results.sanitized.json` and `raw/local/footer-ac11-terms-skip-rerun/results.sanitized.json`.
- **Final authoritative local result:** a fresh, complete run passed `315/315` with `0` failures, `0` flakes, and `0` skips, including the shared footer parity contract across every public document and the genuine 404 at `320`, `375`, `414`, `768`, `1280`, and `1440` pixels. Raw result: `raw/local/footer-ac11-full-browser-final/results.sanitized.json`.
- **Status boundary:** AC11 is **PASS locally** for the current allowlisted working candidate atop `0ce0e023b50bb0d4146fad2e116b91fcb18122bf`. The umbrella task remains **OPEN**: AC2 is not closed and the immutable-preview, provider, approval, promotion, production, DNS/mail, accessibility, monitoring, and durable-independent-verdict gates remain outstanding. Local AC11 proof is not authority to promote or close the task.

## 2026-08-27 AC2 performance correction and combined AC11 re-verification

- **Current local binding:** the corrective fixture build is based on commit `0ce0e023b50bb0d4146fad2e116b91fcb18122bf` with a dirty allowlisted source tree and artifact SHA-256 `b844a7c5d3590ec53dcd7c656d3111d454c9aaf735629285ac8bfb7306d1eae3`. The pinned Node `22.23.2` fixture build and `check-dist` both passed. This is local candidate proof, not a clean-commit or deployed-preview binding.
- **Critical-font correction proof:** the targeted CDP-backed critical-font contract passed `1/1` in `raw/local/performance-font-targeted/results.sanitized.json`. It proves the intended Lato glyph source rather than inferring font use from a CSS family string.
- **Complete local Lighthouse matrix:** `raw/local/performance-current-all-routes/summary.json`, `run-metadata.json`, and the `42` sibling `*.lhr.json` reports retain `42/42` simulated-mobile captures across all `14` indexable routes; the summary reports `PASS` with no threshold failures. Home medians were performance `99`, accessibility `100`, best practices `100`, SEO `100`, LCP `1970.3107ms`, CLS `0.00672632064895339`, and TBT `0ms`. Commercial medians were performance `100`, accessibility `100`, best practices `100`, SEO `100`, LCP `1812.1182ms`, CLS `0.03652625491782134`, and TBT `0ms`. Every other route also passed every frozen budget.
- **Initial combined-suite failure retained:** the first full AC2/AC11 browser run passed `308/315`; its only seven failures were internal navigation font-family alias equality assertions in `raw/local/performance-footer-full-browser-final/results.sanitized.json`. Route-scoped critical aliases intentionally differed as CSS strings even though the dedicated CDP contract proved that the rendered glyphs came from Lato. No geometry, color, focus, runtime, network, or footer assertion failed.
- **Smallest test correction:** normalize the approved route-scoped Lato aliases only for the shared navigation equality comparison while leaving the dedicated platform-font check responsible for proving actual font use. The focused navigation rerun passed `7/7` in `raw/local/performance-nav-alias-targeted/results.sanitized.json`.
- **Authoritative combined rerun:** the fresh complete browser suite passed `315/315` with zero unexpected, skipped, flaky, or top-level-error results in `raw/local/performance-footer-full-browser-final-rerun/results.sanitized.json`; reporter metadata and redaction validation also passed.
- **Status boundary:** AC2 is **PASS locally on the dirty working candidate**, and AC11 remains **PASS locally**. Neither local result satisfies the frozen immutable-preview requirement. The umbrella task remains **OPEN** until the candidate is cleanly committed, deployed through the native Git integration, and the required preview, provider, approval, promotion, production, DNS/mail, accessibility, monitoring, and durable-independent-verdict gates pass.

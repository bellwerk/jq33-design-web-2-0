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

Overall verdict: **UNKNOWN** at exact commit `1523a086618c5dea365477032b6ac73a7a867862`. AC1 and AC5 are PASS; no criterion currently FAILS. The following eight criteria remain UNKNOWN because their required deployed, human, provider, approval, promotion, production, or durability proof cannot be established locally.

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

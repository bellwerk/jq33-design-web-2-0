# JQ33 production launch closure — frozen specification

Frozen: 2026-08-26 (America/Port-au-Prince)  
Task ID: `jq33-production-launch-closure-2026-08-26`  
Starting branch: `codex/jq33-production-readiness-2026-07-29`  
Starting HEAD: `bba145dd89af1242a5766cb00845fc06186b8a8b`  
Starting `origin/main`: `0ea97e083c9b681ecba7f1fd45dc73f9cafed7fb`

## Objective

Close JQ33's production launch in one umbrella task: preserve and promote the
approved 26-file global-navigation candidate, make the smallest non-visual
performance corrections required by the frozen Lighthouse budgets, normalize
the automatic-analytics build contract, add verification-only release and
runtime safeguards, prove an exact immutable Cloudflare Pages preview, obtain
the required action-time approvals, promote PR #1 through native Git, correct
and verify the canonical production deployment, close accessibility/provider/
DNS/search gates, and retain one durable independently verified all-PASS proof
packet.

This task is the release-closure successor to the production-readiness,
production-finalization, global-navigation, analytics-auto-mode, and deployed
404 correction packets. Those packets remain immutable historical evidence.
This task may cite them but must never rewrite, restore, regenerate, stage, or
use their old raw outputs as current proof.

## Frozen starting candidate

At freeze, exactly these 26 tracked files are modified relative to HEAD:

1. `404.html`
2. `admin/portfolio/index.html`
3. `assets/css/critical-shared.css`
4. `assets/css/site.css`
5. `commercial-interior-design-montreal/index.html`
6. `contact/index.html`
7. `index.html`
8. `inquiry/index.html`
9. `journal/_journal-index-template.html`
10. `journal/_journal-template.html`
11. `journal/index.html`
12. `journal/reduction-as-creation/index.html`
13. `privacy/index.html`
14. `projects/_project-template.html`
15. `projects/_projects-index-template.html`
16. `projects/bruton-place-iv/index.html`
17. `projects/canvas-studios/index.html`
18. `projects/ethereal-gallery/index.html`
19. `projects/index.html`
20. `projects/obsidian-lounge/index.html`
21. `projects/project.html`
22. `projects/vortex-showroom/index.html`
23. `scripts/check-hallmark-contract.mjs`
24. `terms/index.html`
25. `tests/browser-contract.spec.mjs`
26. `tokens.css`

The predecessor global-navigation packet records candidate-inventory SHA-256
`6e07ed660492e507d08048784eada20508955fc203f96abe5bb10c5067974f6e`.
AC1 must recompute and confirm that binding before implementation.

The following additional release paths are allowlisted only for the stated
closure work:

- `.env.example`, `DEPLOYMENT.md`, `package.json`, and `pnpm-lock.yaml`;
- `scripts/build.mjs`, `scripts/generate-responsive-images.mjs`,
  `scripts/generate-projects.mjs`, `scripts/generate-journal.mjs`,
  `scripts/check-dist.mjs`, and a minimal
  `scripts/check-production-health.mjs`;
- verification-only `.github/workflows/release-gate.yml` and
  `.github/workflows/production-smoke.yml`;
- this task packet under
  `.agent/tasks/jq33-production-launch-closure-2026-08-26/`.

No other source, content, asset, dependency, configuration, task packet, or
deployment path may change without an owner-authorized refreeze.

## Owner-approved facts carried into this task

The owner has directly approved the brighter cobalt navigation treatment, all
eight retained claim groups, package inclusions, image provenance, and the
legally reviewed Terms. Preserve those exact approved facts. Any factual,
package, image, or legal-content change requires new owner approval.

## Acceptance criteria

### AC1 — Candidate integrity and preservation

- Capture the starting branch/commits, `git status`, exact 26-file diff/hash
  inventory, tool versions, and SHA-256/byte-size manifest of every prior task
  packet before changing production files.
- Confirm the predecessor navigation inventory hash and preserve uniform
  navigation on every public route and breakpoint: identical height, width,
  position, padding, borders, `#5427E1` text, and no link underlines.
- Every changed/staged path is in the frozen allowlist and has a stated AC.
- Prior `.agent/tasks/**` bytes never change. Generated output, credentials,
  caches, populated environment files, and unrelated untracked work are never
  staged.

### AC2 — Non-visual performance closure

- Preserve the approved composition, content, crop, typography, motion,
  responsive geometry, and reduced-motion behavior.
- Fix the root loading causes on `/`,
  `/commercial-interior-design-montreal/`, `/projects/`, and `/journal/` using
  existing image generation, accurate responsive candidates/load priority,
  and static font subsetting; add no runtime dependency or speculative layer.
- On the exact immutable preview, capture three simulated-mobile Lighthouse
  runs for every public route. Each route's median must meet performance >=90,
  accessibility/best-practices/SEO >=95, LCP <=2500 ms, CLS <=0.1, and
  TBT <=200 ms.

### AC3 — Strict build contract and dependency hygiene

- Use Node `22.23.2`, pnpm `11.13.0`, and a frozen install. Version guards fail
  closed.
- A strict non-fixture build uses the authorized distinct direct Formspree
  Contact/Inquiry endpoints and one direct published Calendly event obtained
  without exposing private provider/account data.
- Cloudflare Web Analytics remains automatic platform injection. Retire the
  stale public analytics-token requirement from current configuration,
  documentation, and release checks; do not add a source-managed beacon.
- `pnpm audit --prod` reports no vulnerability and the complete audit reports
  no unresolved high or critical vulnerability. Use only the smallest
  compatible dev-tool upgrades; add no dependency.
- Only `dist/` is publishable. Repository, source, task, environment, admin,
  Supabase, workflow, and build files are absent from the artifact and resolve
  to genuine deployed 404s.

### AC4 — Minimal release and runtime safeguards

- Add one verification-only GitHub Actions release gate using the pinned
  toolchain, frozen install, strict build, `pnpm verify`, and audit. It performs
  no deployment, upload, provider mutation, or promotion.
- After the release gate and Cloudflare Pages checks pass, protect `main` with
  pull requests, strict required checks, conversation resolution, and blocked
  force-push/deletion. Preserve documented administrator rollback bypass.
- Add one hourly Node-standard-library production smoke workflow. It checks
  representative public routes including Projects, the one-hop legacy redirect,
  a real 404, required security headers, and representative source/admin
  isolation paths without submitting forms or collecting private data.
- Document the repository owner as incident owner, GitHub/Cloudflare failure
  notifications, frozen rollback triggers, response sequence, and proof that
  the monitor ran successfully against production.

### AC5 — Pinned local release gate

- From an isolated output/report root, run the strict build, `pnpm verify`,
  deterministic project/journal generation, source isolation, route/redirect,
  form, HTML, security, SEO, image, design-contract, and complete browser checks.
- All required viewport widths, navigation states, form states, keyboard/focus,
  axe, reduced motion, console/network behavior, and horizontal-overflow checks
  pass with no waiver, skipped requirement, flake, or unexpected failure.
- An independent pre-preview verifier judges current files and fresh results.
  Any non-PASS result creates `problems.md`, receives only the smallest allowed
  correction, and is freshly reverified.

### AC6 — Exact immutable preview

- Explicit-path stage and commit only the frozen release scope, push the current
  branch, and let the existing `jq33-design-website` Cloudflare Pages native Git
  integration build it with real Preview values. Wrangler/manual upload and a
  second deployment workflow are forbidden.
- Bind current evidence to the exact clean commit, Cloudflare deployment ID,
  immutable URL, build result, artifact manifest/hash, and timestamp.
- Fresh deployed-byte parity, route/redirect/404/header/CSP/source-isolation,
  crawl, asset, browser, responsive, accessibility, console/network,
  navigation, and AC2 Lighthouse checks all pass. The old `675c8d95` preview
  and fixture artifacts cannot satisfy AC6.

### AC7 — Human, provider, and preview conversion proof

- Complete genuine browser-chrome 200% zoom checks for every distinct template
  and interactive state plus a real Windows NVDA transcript covering navigation,
  landmarks/headings, disclosures, forms/errors/status, social links, and
  Calendly.
- In authorized accounts, verify the two Formspree destinations/ownership and
  spam controls, automatic Cloudflare Analytics association, and published
  Calendly future availability; retain redacted evidence only.
- Immediately before preview submissions, obtain owner confirmation naming the
  immutable preview and two new non-sensitive tags. Prove exactly one accepted
  request and one inbox delivery per form. Exercise validation, honeypot,
  controlled failure/retry, timeout, value preservation, and duplicate
  prevention without creating extra accepted messages. Open Calendly without
  booking.

### AC8 — Controlled promotion through PR #1

- AC1–AC7 are all PASS for the exact candidate and preview.
- Record and verify a currently selectable successful production deployment as
  the rollback target.
- Obtain immediate owner approval before marking PR #1 ready and merging to
  `main`. A stale approval does not bypass this gate.
- Cloudflare Pages automatically deploys the exact merged `main` commit. No
  manual upload or alternate production path is permitted.

### AC9 — Production, DNS, mail, analytics, and search closure

- Read-only audit custom-domain/DNS ownership first. With authorization, ensure
  apex and `www` serve only the intended `jq33-design-website` production
  deployment while preserving the rollback target.
- Bind the production deployment and bytes to the merged commit and clean
  strict build. Pass all routes, Projects, legacy/query/canonical one-hop
  redirects, real 404s, security headers, source isolation, sitemap/robots,
  forms, assets, navigation, and runtime-monitor checks.
- Immediately before production submissions, obtain two new owner-approved
  tags. Prove exactly one delivery per form, open Calendly, and retain one
  timestamped apex analytics pageview.
- At the DNS approval gate, propose monitoring-first DMARC `p=none`, strict
  alignment, and aggregate reporting to a confirmed `dmarc@jq33.design` alias.
  Publish only the exact owner-approved record. Verify MX, one SPF policy, DKIM,
  and DMARC authoritatively and through `1.1.1.1` and `8.8.8.8`; retain redacted
  headers from one tagged domain-mail test proving aligned SPF/DKIM/DMARC PASS.
- Obtain immediate approval before submitting the sitemap in Search Console;
  retain accepted-status evidence. Roll back only for a frozen trigger and only
  after immediate owner approval.

### AC10 — Durable independent all-PASS closure

- Create current `evidence.md`, `evidence.json`, retained `raw/` artifacts, and
  `verdict.json` under this task, mapped to AC1–AC10 and bound to exact
  commits/deployments/timestamps. Preserve first failures and corrective reruns.
- A fresh independent verifier judges the current repository, exact preview,
  exact production deployment, external evidence, monitoring, and task packet.
- Commit the final packet through a small evidence-only PR under this same task,
  proving the public `dist` artifact is unchanged.
- Completion is permitted only after the evidence-only PR is durable on `main`,
  AC1–AC10 are each PASS, overall verdict is PASS, production monitoring is
  active, and no required fact remains FAIL, PARTIAL, UNKNOWN, or waived.

## Mandatory stop and approval gates

Stop and keep the affected AC `UNKNOWN` rather than infer authority before:

1. preview Contact/Inquiry submissions and their two tags;
2. any NVDA installation or provider-account action requiring new access;
3. publishing the exact DMARC record/reporting mailbox;
4. marking PR #1 ready and merging;
5. production Contact/Inquiry submissions and their two new tags;
6. Search Console submission;
7. any custom-domain change whose read-only audit shows unexpected ownership;
8. any rollback.

The task stays open across these gates and is never split merely because it is
waiting for action-time approval.

## Required sequence

1. Freeze this spec and capture AC1 baselines.
2. Implement only AC2–AC4 changes and prove AC5 locally.
3. Obtain a fresh independent pre-preview verdict.
4. Commit/push and prove the exact immutable preview under AC6.
5. Complete AC7 only with its action-time approvals.
6. Obtain AC8 approval, merge through native Git, and verify AC9.
7. Assemble current evidence, run an independent verifier/fixer loop until all
   criteria PASS, and make the evidence durable under AC10.

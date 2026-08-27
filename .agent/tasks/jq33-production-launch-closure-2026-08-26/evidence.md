# JQ33 production launch closure — exact-commit evidence ledger

Updated: 2026-08-26T21:54:36.3027088Z

Phase: pre-preview verification

Frozen spec: `spec.md`

Exact source commit: `1523a086618c5dea365477032b6ac73a7a867862`

Overall verdict: **UNKNOWN**. AC1 and AC5 are PASS; AC2–AC4 and AC6–AC10 remain UNKNOWN. There are no current FAIL criteria, but completion and promotion are not allowed.

## Acceptance-criterion matrix

| AC | Verdict | Current proof |
| --- | --- | --- |
| AC1 | PASS | Relative to frozen start `bba145d…`, the exact commit contains 38 allowlisted release paths and 33 current-task paths, with zero unexpected committed paths. The frozen candidate and prior-packet byte bindings remain intact. |
| AC2 | UNKNOWN | Static performance implementation checks pass. The required immutable-preview three-run Lighthouse matrix for every public route is absent. |
| AC3 | UNKNOWN | Pinned strict non-fixture builds, 112-file artifact isolation, and both audits pass locally. Genuine deployed preview 404/source-isolation proof is absent. |
| AC4 | UNKNOWN | Release/runtime workflow review, production-health self-test, and evidence-contract self-tests pass. Protected `main` and a successful real production monitor run are not proven. |
| AC5 | PASS | Exact clean-worktree CRLF/LF builds are deterministic; the exact LF full browser run passed 308/308 with no skip, retry, flaky, unexpected result, or error; fresh axe/navigation/focus correction coverage passed 3/3. |
| AC6 | UNKNOWN | No native immutable Cloudflare Pages preview is bound to `1523a08…`. |
| AC7 | UNKNOWN | Genuine 200% Chrome, NVDA, provider-account, approved preview-form, and Calendly-open proof is absent. |
| AC8 | UNKNOWN | Prerequisite preview gates, rollback target, immediate merge approval, PR #1 promotion, and automatic deployment are absent. |
| AC9 | UNKNOWN | Production, custom-domain, DNS/mail/DMARC, analytics, form, monitor, and Search Console closure is absent. |
| AC10 | UNKNOWN | Eight ACs remain UNKNOWN; no final evidence-only PR or active production-monitor proof exists. |

## Supplied clean-worktree proof

I independently inspected the two supplied clean worktrees at the exact commit. Both used Node `22.23.2`, pnpm `11.13.0`, frozen installs, and strict non-fixture builds. The CRLF checkout's `projects/_projects-index-template.html` contains 927 CR bytes; the LF checkout contains zero. Both manifests report `sourceDirty=false`, `sourceChangeCount=0`, 112 artifact files, identical file-entry arrays with zero differences, and artifact SHA-256:

`f34d22641769eb52b3a8c4f5bc5db98560d49ce7350d1fb3c23d93de38243096`

The exact LF sanitized reporter is bound to the same source/artifact plus browser-harness SHA-256 `6a46950c7fd2de281df9c35e8d90c071ce7e5df4518dab131ed05cd1ad46042a`. Its own SHA-256 is `0232812721b5513926f39e4e4961037afa44e0f99b6d537542f1f33aad6e8ab4`; it records 308/308 passed with two workers, zero skipped/unexpected/flaky/retried results, and zero top-level errors. Metadata/redaction checks pass.

## Preserved failure and smallest correction

The pre-fix exact clean LF browser run at `4ba02ca8bb96f1de9b497bdd7091083ead41cbdd` retained one serious axe `color-contrast` failure while the drawer was in motion:

- Mobile Projects link: 2.92:1, required 4.5:1.
- Drawer Calendly CTA: 4.33:1, required 4.5:1.

The root cause was opacity animation on the drawer parent, which blended both foreground and background colors during sampling. Commit `1523a086618c5dea365477032b6ac73a7a867862` makes the drawer opaque and animates `translateX` in only `assets/css/critical-shared.css` and `assets/css/site.css`. The fresh pinned verifier rerun passed drawer axe contrast, cross-route 375px navigation parity, and focus trap/Escape/focus restoration 3/3; the exact full rerun passed 308/308.

## Fresh verifier reruns

Under the pinned toolchain, the verifier reran and passed:

- frozen install;
- frontend, links, images, and strict static artifact checks;
- production and complete high-severity audits, each with no known vulnerability;
- production-health self-test;
- all evidence-contract self-tests;
- targeted drawer axe/navigation/focus tests (3/3).

## Proof boundaries

- **Local fixture/browser proof:** PASS locally. Browser tests use loopback and controlled test network/form behavior; they do not prove provider receipt or deployed runtime.
- **Immutable preview proof:** absent. No preview ID, immutable URL, deployed-byte parity, HTTP matrix, browser matrix, or Lighthouse matrix exists for this commit.
- **Production proof:** absent. No authorized promotion or current production/DNS/mail/analytics/search/monitor proof exists.
- **Human/provider approval proof:** absent. No approval-gated form submissions or provider mutation occurred.

## Durable raw verifier records

- `raw/verifier-prepreview/exact-1523a08-local-proof.json` — SHA-256 `e8c184a5eb82845793a55d4e9770a0fc72170d183f2e52b4391b13a99927319f`
- `raw/verifier-prepreview/drawer-contrast-failure-and-correction.json` — SHA-256 `2f5127be28c3ef59592dd95adb89b17af5579d7400dc8ffe6f9f73f4aef8b17d`

Both compact records exclude provider values, personal account data, and absolute machine paths.

## 2026-08-27 local dirty-tree AC2 and AC11 addendum

This addendum supersedes only the current-status statements above; it does not replace or erase the exact-commit evidence, retained failures, or corrective records from the earlier snapshot. The present candidate is an allowlisted dirty working tree based on commit `0ce0e023b50bb0d4146fad2e116b91fcb18122bf`, so the umbrella task remains **OPEN** and no deployment or completion claim is allowed.

### Current candidate and build binding

- Pinned runtime: Node `22.23.2`; package manager: pnpm `11.13.0`.
- Pinned fixture build: **PASS**.
- Distribution validation (`check-dist`): **PASS**.
- Current local artifact SHA-256: `b844a7c5d3590ec53dcd7c656d3111d454c9aaf735629285ac8bfb7306d1eae3`.
- Generated Projects and Journal source parity: **PASS** for all eight outputs in `raw/portable/footer-generator-determinism-2026-08-27.txt`; two independent temporary generations matched each other and the checked-in pages without retaining machine paths.
- Source boundary: `sourceDirty=true`; this artifact is not yet bound to a clean commit or immutable Cloudflare Pages deployment.

### AC2 local performance proof

The targeted critical-font Playwright contract passed `1/1` in `raw/local/performance-font-targeted/results.sanitized.json`. It uses CDP platform-font evidence to prove the rendered Lato glyph source and also verifies the intended pre-intent loading boundary.

The complete local simulated-mobile Lighthouse matrix is retained as `raw/local/performance-current-all-routes/summary.json`, `run-metadata.json`, and the `42` sibling `*.lhr.json` reports: three captures on each of the `14` indexable routes. The summary reports overall `PASS` with no failures. The two formerly failing routes now measure:

| Route | Perf | A11y | BP | SEO | Median LCP | Median CLS | Median TBT |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 99 | 100 | 100 | 100 | 1970.3107 ms | 0.00672632064895339 | 0 ms |
| `/commercial-interior-design-montreal/` | 100 | 100 | 100 | 100 | 1812.1182 ms | 0.03652625491782134 | 0 ms |

Every other route also satisfies performance >=90, accessibility/best-practices/SEO >=95, median LCP <=2500ms, CLS <=0.1, and TBT <=200ms. AC2 is therefore **PASS for the current local dirty-tree layer only**. The criterion remains externally unresolved until this exact release byte set is cleanly committed and the frozen immutable-preview matrix passes.

### Combined AC2/AC11 browser correction and final rerun

The first combined full-browser run retained at `raw/local/performance-footer-full-browser-final/results.sanitized.json` passed `308/315`. Its seven failures were limited to a test comparing literal CSS font-family strings across navigation routes: route-scoped critical Lato aliases intentionally have different names, although the dedicated CDP contract proved that their rendered glyphs are Lato. The smallest test-only correction normalizes those approved aliases for the shared-navigation equality assertion while retaining the independent platform-font proof.

- Targeted navigation rerun: `7/7` PASS in `raw/local/performance-nav-alias-targeted/results.sanitized.json`.
- Authoritative full rerun: `315/315` PASS in `raw/local/performance-footer-full-browser-final-rerun/results.sanitized.json`.
- Final browser metadata: zero unexpected, skipped, flaky, retried, or top-level-error results; reporter metadata/redaction validation PASS.

AC11 is **PASS for the current local candidate**: the shared footer and navigation contracts survived the performance correction and the complete browser suite. Its immutable-preview and later production bindings remain pending under AC6-AC10.

### Current status boundary

| Criterion | Current local status | Umbrella status |
| --- | --- | --- |
| AC2 | PASS — pinned fixture build, CDP font proof, and 42/42 local Lighthouse captures | UNKNOWN pending clean commit and immutable-preview proof |
| AC11 | PASS — authoritative 315/315 full browser rerun | UNKNOWN pending immutable-preview and production rebinding |

No synthetic form submission, provider mutation, merge, production promotion, DNS/mail change, Search Console submission, or rollback occurred while producing this evidence. The task stays open for the clean-commit, preview, external, approval-gated, production, and independent-final-verdict phases.

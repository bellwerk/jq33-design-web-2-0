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

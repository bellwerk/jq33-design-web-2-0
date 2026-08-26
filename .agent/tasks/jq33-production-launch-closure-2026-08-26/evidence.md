# JQ33 production launch closure — evidence ledger

Updated: 2026-08-26T21:00:27Z
Phase: pre-preview verification
Frozen spec: `spec.md`

This ledger is intentionally open. It distinguishes locally proven release
facts from immutable-preview, provider, human-accessibility, merge, production,
DNS, mail, analytics, search, and final-durability gates that cannot yet be
claimed.

## Current result

| AC | State | Current evidence |
| --- | --- | --- |
| AC1 | PASS | Starting branch/commits and the exact predecessor 26-file navigation binding were captured before implementation. The predecessor inventory matched all 26 bytes/hashes. All 20 prior packets reproduce their frozen canonical byte aggregates with zero mismatches. Both release inventories are now explicitly bound to `git show :path` bytes: 76/76 entries match the 38 staged release blobs. The retained initial mismatch was CRLF normalization in `admin/portfolio/index.html`; no release byte changed. The next explicit-path package is expected to contain 71 paths: 38 release plus 33 current-task proof paths, with zero prior-task or unexpected paths. |
| AC2 | UNKNOWN | The four identified LCP causes have minimal static corrections: exact 2,628-byte homepage and 4,016-byte commercial font subsets, ten Projects 480/768 derivatives, six Journal 768 derivatives, responsive contracts, and selective priority. Static checks pass; the required 42 fresh immutable-preview Lighthouse captures do not exist yet. |
| AC3 | UNKNOWN (local PASS) | Node 22.23.2 and pnpm 11.13.0 are exact and fail closed. Frozen install passed. The strict non-fixture build used redacted, distinct direct Formspree values and a direct Calendly event. Both audits report no known vulnerability. The corrected 112-file artifact hash is `b95283c5e71563e86aa0fca7d7b17e63a672983f7758436af99d30709af5ace6`. Automatic Cloudflare Analytics remains the documented contract. Exact-preview source-isolation HTTP proof is still required. |
| AC4 | UNKNOWN | Verification-only Release Gate and hourly standard-library Production Smoke workflows are implemented; pinned action SHAs and monitor negative self-tests pass. GitHub has the three required public build secret names. `main` protection and a successful production monitor run must wait for the pushed checks/current production correction. |
| AC5 | PASS | The exact corrected tree passed all static gates and 308/308 Chromium tests, including every public route, six required widths, continuous 320–1920 px overflow coverage, navigation parity, keyboard/focus, axe, form states, reduced motion, runtime/console/network boundaries, and metadata redaction. Its Cloudflare Pages local-emulation health matrix also passed after preserving and correcting the first fingerprint failure. Project/Journal generation is byte deterministic and matches eight checked-in generated pages. A fresh independent verifier reproduced the strict artifact, parsed the 308/308 run, and passed a fresh 22/22 targeted rerun. |
| AC6 | UNKNOWN | No fresh commit-bound Cloudflare preview exists. The retired `675c8d95` preview is used only as a public source for already-authorized integration values and cannot satisfy this gate. |
| AC7 | UNKNOWN | Genuine Chrome 200% zoom, Windows NVDA, provider-account readbacks, preview submissions, and Calendly-open evidence remain approval/access gated. No form was submitted. |
| AC8 | UNKNOWN | PR #1 remains open and draft. No rollback target or immediate merge approval has been recorded. |
| AC9 | UNKNOWN | Production, custom-domain, production-form, analytics, DNS/mail/DMARC, and Search Console work has not been promoted. The initial production health failure is retained. |
| AC10 | UNKNOWN | This is a live pre-preview packet, not the final all-PASS independent verdict or evidence-only PR. |

## Retained raw evidence

- `raw/baseline/candidate-binding.json`
- `raw/baseline/prior-task-packets.json`
- `raw/baseline/prior-task-packets-postimplementation-hashes.json`
- `raw/baseline/postimplementation-release-inventory.json`
- `raw/portable/staged-release-inventory-index-mismatch.txt`
- `raw/portable/staged-release-inventory-index-correction.txt`
- `raw/portable/toolchain-install-audit-selftest.txt`
- `raw/portable/toolchain-guard-negative.txt`
- `raw/portable/toolchain-guard-negative-pnpm.txt`
- `raw/local/release-safeguards-review-findings.md`
- `raw/portable/release-safeguards-review-rerun.txt`
- `raw/portable/pinned-strict-verify-precommit.txt`
- `raw/portable/pinned-strict-verify-precommit-attempt-02.txt`
- `raw/portable/pinned-strict-verify-precommit-attempt-03.txt`
- `raw/local/playwright-precommit-attempt-03/results.sanitized.json`
- `raw/portable/production-health-wrangler-local.txt`
- `raw/portable/production-health-wrangler-local-attempt-02.txt`
- `raw/portable/generator-determinism-and-source-parity.txt`
- `raw/local/dist-manifest-precommit-dirty-source.json`
- `raw/performance/asset-optimization-contract.json`
- `raw/operations/github-state-prepreview.json`
- `raw/operations/production-health-initial.txt`
- `raw/operations/social-build-inputs-redacted.json`
- `raw/verifier-prepreview/current-release-inventory.json`
- `raw/verifier-prepreview/fresh-checks.json`
- `verdict.json`
- `problems.md`

The earlier strict runs and the initial local health failure are retained
separately from the exact-tree corrective rerun. Neither
is clean-commit or deployed-byte proof; that evidence must be rebuilt after the
release candidate is committed. The current independent verdict is therefore
`UNKNOWN` with AC1 and AC5 PASS, zero FAIL criteria, and eight deployment- or
approval-dependent UNKNOWN criteria. The release inventories now describe the
actual staged Git blobs rather than worktree line endings; the preserved
mismatch and corrective PASS do not change any criterion status.

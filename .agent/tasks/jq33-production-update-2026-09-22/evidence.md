# Production update evidence — prepromotion

Reviewed source candidate: `ab86817200f85449447da6812b754dddb06d139c`. This packet proves **AC1–AC3 PASS**. **AC4 and AC5 remain UNKNOWN (pending)** until protected-main merge, successful production deployment, and fresh final verification. Nothing here claims production completion.

The user authorized publication with “please push to production.” [PR 2](https://github.com/bellwerk/jq33-design-web-2-0/pull/2) contains the approved acquisition/content work, transparent cobalt menu links matching the homepage wordmark, and removal of the logo caption. The 57 release-source files are frozen in [the inventory](raw/source-inventory-platform-final.json). Homepage hero markup/styles, expressive typography, project assets/data, and English service scope are preserved. Unrelated historical evidence and screenshots remain outside the reviewed source release.

The final source fixes include emitted-byte versions for seven public scripts, a thin light menu-text edge, patched sharp/fast-uri build dependencies, Services’ stable 6.55em desktop heading width, and a bounded test-helper wait for real finite CSS transitions. No accessibility assertion, geometry threshold, audit gate, or branch protection was bypassed.

## Current candidate proof

- [Release Gate 35765231913](https://github.com/bellwerk/jq33-design-web-2-0/actions/runs/35765231913) completed successfully on this exact candidate. [Raw CI log](raw/ci-platform-pass.log) proves Node 22.23.2/pnpm 11.13.0, frozen install, two audits with zero findings, strict real-provider build/static checks, **398 expected non-flaky browser tests**, and the production-monitor self-test. [Check readback](raw/ci-platform-pass.json) binds both required successful checks to the candidate.
- Windows did not produce one clean full final run: 396 cases passed and two failed with transport buffer errors; the two exact cases later passed separately. Earlier failures and recovery results remain under local raw evidence. The complete Linux CI run above is the definitive full-suite proof.
- [Independent current-source review](raw/verifier-platform-source.json) passes. The strict distribution contains 112 allowlisted files, artifact SHA-256 `1c7b127d14b750477290cd3e50624aca34abc795a26c9a4062f3ee27c6488711`, and clean source binding `10a72245b3b39d9ea62488b8b9312aefa321fa5d8e1414c8b7badb212381711a`.
- Immutable preview [08dfee77](https://08dfee77.jq33-design-website.pages.dev) is successful for the candidate. Both the [builder matrix](raw/preview-platform/status-matrix.json) and [independent matrix](raw/verifier-preview-platform/status-matrix.json) pass routes, artifact bytes, redirects, isolation paths, and security/configuration checks.
- [Hosted browser observations](raw/preview-platform-browser-observations.json) confirm five transparent menu links at rgb(59, 65, 227), matching the central wordmark; no logo caption; correct Services display font and whole-word heading. Independent font-fallback diagnostics also confirm the width repair without changing the font or mobile rule.

## Remaining promotion work

The original successful rollback is deployment `f78514e5-5815-461c-9449-976febdc8a47`, commit `708ea8d261dab90c51aa2b15a807849f308bac8f`. Use existing Cloudflare Pages Git integration; do not upload an artifact manually. Resolve the review thread, retain all required checks on the eventual PR head (including any evidence-only follow-up), merge through protected main, then bind fresh production results to the resulting commit and deployment.

Only public provider destinations were used for strict builds; no credentials or fixture artifact were published. Browser form tests use mocks. No inbox-delivery test or real booking was performed. Booking availability was observed without submitting a booking. Analytics account reporting and Search Console indexing are not claimed.

[Machine-readable evidence](evidence.json) and [independent prepromotion verdict](prepromotion-verdict.json) distinguish completed candidate checks from pending production proof. A later proof-packet commit must be identified separately from this source candidate; identical public bytes do not substitute for its required check result.

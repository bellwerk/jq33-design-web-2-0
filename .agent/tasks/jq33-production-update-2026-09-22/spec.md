# Production update — 2026-09-22

User authorization: "please push to production" after approving the current website preview, transparent menu links, menu color matching the central wordmark, and removal of the logo caption.

## Scope and constraints

Release the approved local acquisition, layout, content and navigation work through existing Cloudflare Pages Git integration. Preserve unrelated historical evidence and screenshots. Do not deploy fixture artifacts, change credentials or security protections, invent client proof, modify project assets, or submit messages through forms without authorization. Keep the homepage visual identity and English service journey. Make only release-blocking fixes; freeze any necessary fix before implementation. No direct upload or force push.

## Acceptance criteria

- AC1: Inventory and review the exact source release against current production; preserve unrelated working-tree artifacts. Record the rollback deployment and commit.
- AC2: Current candidate passes required build, static, browser and production monitor checks under Node 22.23.2 / pnpm 11.13.0; real provider build passes on the candidate in CI.
- AC3: Candidate branch and pull request are published; Release Gate and Cloudflare Pages checks pass on the candidate; verify immutable preview routes, bytes, configuration and requested navigation changes.
- AC4: Merge through the existing protected main branch with user authorization; verify successful Cloudflare production deployment for the resulting commit and production route/security/navigation checks.
- AC5: Retain current command results and release evidence; fresh independent verification reports every criterion honestly, including any provider-delivery or external checks unavailable without additional user action.

## Initial production binding

- Repository: bellwerk/jq33-design-web-2-0
- Production commit: 708ea8d261dab90c51aa2b15a807849f308bac8f
- Successful rollback deployment: f78514e5-5815-461c-9449-976febdc8a47
- Production origin: https://jq33.design
- Required branch checks: Release Gate; Cloudflare Pages. Current API requires zero approving reviews; no protection changes are authorized.

Production inbox delivery is separate from static form/booking destination checks; record the distinction. DEPLOYMENT.md launch flow must be considered against the current production-update scope and owner authorization before promotion.

## Frozen release fix: shared script caching

Changed header, form, and booking scripts use stable URLs while published assets have one-day browser caching. Before release, add content-derived `v` query parameters to built HTML references for the seven existing allowlisted public scripts and validate those hashes in check-dist. Keep public script paths, source-page content, provider behavior and deployment topology unchanged. New hash URLs must reflect emitted, substituted script bytes; existing footer version queries must be replaced. No broader caching/infrastructure changes.

## Frozen release fix: menu text contrast

The full release suite found serious color-contrast violations on the new transparent desktop menu, including the homepage and legal routes. Preserve the requested wordmark color and transparent backgrounds; add a thin light edge around the menu glyphs in both critical/final CSS, then visually check and rerun contrast/navigation tests. Do not restore filled labels, change the approved purple, alter the homepage composition, or suppress accessibility rules.

## Frozen release fix: dependency audit

GitHub Release Gate run 35762680470 found new high-severity advisories in fast-uri and sharp. Update only affected direct/transitive build dependencies to patched versions (fast-uri 3.1.6 or later compatible patch; sharp 0.35.4), retaining the pinned Node/pnpm versions and audit enforcement. Regenerate the lockfile using pnpm, verify a frozen install and dependency audits, rebuild/recheck affected output, and wait for all required CI checks on the new candidate before merge. Primary advisories: https://github.com/advisories/GHSA-5jgf-p345-68v8 and https://github.com/advisories/GHSA-rgj7-g3m4-5g8c.

## Frozen release fix: cross-platform heading width and settled geometry

GitHub run 35763390426 passes 394 cases but fails three Services word-wrap checks and one homepage settled-geometry check. Investigate the Services heading's 10ch cap (the inlined heading subset excludes the zero glyph used by ch) and replace the platform-dependent cap with the existing content-container width if measurements confirm it; retain expressive font, font sizes, header clearance and mobile behavior. For the geometry case, identify the moving element and wait for real finite entry transitions before measuring only if evidence shows an active transition, retaining the existing movement threshold and all assertions. Do not disable motion, suppress tests, or change the homepage hero. Rerun the full required local and GitHub checks on the final candidate.

Measurements confirm Windows 10ch equals 6.544em, while omitting its local Arial fallback reproduces the CI word split at all three failing sizes. Freeze 6.55em in both desktop heading rules to preserve the approved line composition (using full container width would alter the tablet composition); keep the existing mobile 100% override. The motion probe confirms the 220ms work-background transition remains active after settlePage, so wait for running/pending finite CSS transitions before geometry sampling, with a bounded timeout and unchanged movement assertions.

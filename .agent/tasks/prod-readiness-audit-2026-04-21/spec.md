# Task Spec: prod-readiness-audit-2026-04-21

## Metadata
- Task ID: prod-readiness-audit-2026-04-21
- Created: 2026-04-21T17:10:22+00:00
- Repo root: C:\Users\BELLWERK\Documents\PROJECTS\JQ33 DESIGN\WEB 2.0
- Working directory at init: C:\Users\BELLWERK\Documents\PROJECTS\JQ33 DESIGN\WEB 2.0

## Guidance sources
- None detected at init time.

## Original task statement
Production-readiness remediation and prior-agent audit for JQ33 DESIGN web repo

## Acceptance criteria
- AC1: Workflow artifacts for `prod-readiness-audit-2026-04-21` are initialized, spec is frozen, and validation passes.
- AC2: Default Open Graph and Twitter image references use a raster asset (PNG/JPG) for launch-critical pages/templates and build generators.
- AC3: Duplicate `supabase-config.js` includes are removed from projects index template and generated output; there is exactly one include on each page.
- AC4: Fallback project route metadata is crawler-safe by default (non-indexable unless explicit static page metadata applies).
- AC5: Deployment contract documentation aligns with runtime configuration and Supabase function auth requirements.
- AC6: Production checks (`build`, link/redirect/image checks, syntax checks) pass and are captured in evidence artifacts.

## Constraints
- Preserve existing unrelated working tree changes.
- Keep changes minimal and scoped to production readiness blockers and verification artifacts.
- Do not use destructive git operations.
- Keep workflow artifacts and proof outputs inside the repository task folder.

## Non-goals
- Redesigning visual UI or site structure outside the listed blockers.
- Rewriting Supabase business logic beyond required documentation and compatibility checks.
- Adding CI workflows or external deployment automation not requested in this task.

## Verification plan
- Build: `pnpm.cmd build`
- Unit tests: Not available in this static-site repository (recorded as N/A).
- Integration tests: Not available in this repository (recorded as N/A).
- Lint: Not available in package scripts (recorded as N/A); run syntax checks on changed JS/TS files.
- Manual checks:
  - Confirm no duplicate `supabase-config.js` include in HTML pages.
  - Confirm OG/Twitter defaults point to raster asset paths.
  - Confirm fallback project page uses safe robots policy.

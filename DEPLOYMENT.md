# JQ33 static deployment

The production surface is the generated `dist/` directory only. It contains
static public pages, allowlisted assets, the real `404.html`, `_redirects`, and
generated `_headers`. The repository root, Pages Functions, admin UI, project
shell, source data, templates, and Supabase code are never deployment inputs.

## Required build inputs

Configure these public-safe build inputs as GitHub **repository or organization
Actions variables**, not environment-scoped variables. The candidate is built
before any deployment environment is entered, so environment-scoped `PUBLIC_*`
values are intentionally unavailable to the build job:

- `PUBLIC_FORMSPREE_CONTACT_URL`: direct Contact endpoint on `https://formspree.io/f/...`
- `PUBLIC_FORMSPREE_INQUIRY_URL`: a different direct Inquiry endpoint
- `PUBLIC_CALENDLY_URL`: the user-supplied published event URL, not a profile root
- `PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN`: the 32-character public token copied
  from the Cloudflare Web Analytics manual JS snippet
- optional confirmed social profile URLs listed in `.env.example`

The build fails closed if a required value is absent, malformed, duplicated, or
points to the wrong provider. No Supabase, CRM, Google Analytics, runtime config,
secret, or private QA address belongs in these values.

Keep deployment authority environment-scoped:

- `preview` and `production` variables: `CLOUDFLARE_PAGES_PROJECT` and
  `CLOUDFLARE_AUTOMATIC_HTML_INJECTION=disabled`
- `preview` and `production` secrets: `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID`
- `production` and `production-finalization` variable:
  `RELEASE_REVIEW_POLICY=independent-review-required`

Do not copy Cloudflare credentials into repository or organization variables.
The finalization environment needs no deployment credential.

## Protected release environments

Create both `production` and `production-finalization` in GitHub before the
workflow is enabled. For each environment, require at least one independent
reviewer, enable **Prevent self-review**, and restrict deployment branches to
`main`. The reviewer must compare the dispatch identities and hashes with the
sealed artifacts; an author approving their own evidence does not satisfy this
boundary. Keep `RELEASE_REVIEW_POLICY=independent-review-required` on both
environments so a missing or renamed policy fails before tooling or deployment.

Configure Web Analytics as **Enable with JS Snippet installation** in Cloudflare
and keep Pages automatic snippet injection disabled. The build inserts exactly
one manual Cloudflare beacon into every public HTML document and the 404 page.
This is required so preview and production bytes remain identical; the public
analytics site token is not a private credential. CI rejects missing, duplicate,
placeholder, or platform-injected beacons and production proof requires both the
beacon request and its RUM request.

For local-only integration tests, explicit localhost URLs may be used with
`pnpm build:test-fixtures`. That mode is rejected when `NODE_ENV=production`.

## Reproducible candidate

Use Node.js 22 and the pinned package manager:

```powershell
corepack prepare pnpm@11.13.0 --activate
pnpm install --frozen-lockfile
pnpm build
pnpm check:launch
pnpm lighthouse:capture
pnpm lighthouse:summarize
```

The build deletes and recreates exactly `dist/`, then writes
`dist-manifest.json` outside the deployable directory. The manifest records every
allowlisted file and a deterministic aggregate artifact checksum.

To inspect the candidate without deploying, use the repository-pinned Wrangler:

```powershell
pnpm wrangler pages dev dist
```

Set `PROJECT_ROUTE_BASE_URL` to that preview origin and rerun
`pnpm check:project-routes` to prove the five project routes return direct `200`
responses while unknown routes return the branded `404`.

## CI promotion boundary

`.github/workflows/production-readiness.yml` builds once on Node 22 with pnpm
11.13.0. The workflow uploads that exact `dist/` plus its manifest, deploys the
downloaded artifact as the candidate preview, and never rebuilds in a deployment
job.

Production promotion is blocked unless all of the following are recorded:

1. A successful `verify-candidate` run on `main` has produced the immutable
   candidate artifact and sealed preview attestation.
2. The frozen task's `evidence.json` contains AC1 through AC13 with `PASS` for
   complete scopes and `PRE_PROMOTION_PASS` only for the exact scopes that must
   be closed after deployment. No blocking status remains.
3. All 13 external/manual gates below have distinct, structured, hashed proof.
4. The `promote-production` dispatch supplies the exact `candidate_run_id`,
   40-character `candidate_commit_sha`, and SHA-256 of the committed strict
   pre-promotion `evidence.json` as `prepromotion_evidence_sha256`.
5. The `production` GitHub Environment authorizes the job.

There is no `gate_verdict` dispatch input. For production, select
`operation=promote-production` and supply only the candidate and evidence
identity inputs listed above. The job performs a fresh machine validation: it
recomputes hashes and parses the current candidate-bound evidence and verifier
output. The verdict is structured input, not cryptographic proof of who authored
it. Machine checks bind it to the candidate and reject stale or non-passing
claims; the required independent `production` environment reviewer remains the
human trust boundary and must inspect the referenced raw proof.

Only these paths may change between the selected candidate commit and the
promotion commit:

- `.agent/tasks/jq33-production-readiness-2026-07-29/evidence.json`
- `.agent/tasks/jq33-production-readiness-2026-07-29/evidence.md`
- `.agent/tasks/jq33-production-readiness-2026-07-29/verdict.json`
- `.agent/tasks/jq33-production-readiness-2026-07-29/problems.md`
- `.agent/tasks/jq33-production-readiness-2026-07-29/raw/deployed-preview/candidate-attestation.json`
- gate-specific proof below
  `.agent/tasks/jq33-production-readiness-2026-07-29/raw/external/`

The workflow rejects every other changed path, including `spec.md` and arbitrary
task content. This preserves the frozen specification and prevents application,
build, dependency, or workflow changes from being smuggled into an evidence-only
promotion commit.

The production job revalidates the downloaded manifest and deploys the same
candidate directory. Do not run a manual production deploy or point Wrangler at
the repository root. AC13 and final completion still require read-only
production smoke/parity evidence after promotion.

After the production parity artifact exists, dispatch
`operation=finalize-production` with the original candidate run and commit, the
successful promotion run and commit, the downloaded production-parity SHA-256,
and the SHA-256 of `final-evidence.json`. The finalization guard uses two
separate comparisons. From candidate commit to selected promotion commit it
allows only the sealed pre-promotion paths above. From promotion commit to the
current finalization commit it allows only:

- `.agent/tasks/jq33-production-readiness-2026-07-29/evidence.md`
- `.agent/tasks/jq33-production-readiness-2026-07-29/final-evidence.json`
- `.agent/tasks/jq33-production-readiness-2026-07-29/verdict.json`
- `.agent/tasks/jq33-production-readiness-2026-07-29/problems.md`
- `.agent/tasks/jq33-production-readiness-2026-07-29/raw/promotion/`
- `.agent/tasks/jq33-production-readiness-2026-07-29/raw/cloudflare-production/`
- `.agent/tasks/jq33-production-readiness-2026-07-29/raw/deployed-production/`
- `.agent/tasks/jq33-production-readiness-2026-07-29/raw/finalization/`

These production/finalization directories contain only the hashed raw inputs or
redacted summaries consumed by the terminal verifier. The second comparison
rejects changes to `evidence.json`, the candidate attestation, all external gate
proof, `spec.md`, application files, tooling, dependencies, workflow changes,
and every other arbitrary task path after promotion.

The `www` hostname redirect cannot be expressed in a Pages `_redirects` file:
Cloudflare accepts only relative source patterns there. Configure one
zone-level Redirect Rule from `https://www.jq33.design/*` directly to
`https://jq33.design/${path}` with status `301`, preserving path and query.
Record an HTTP matrix proving that the rule completes in one hop. This external
rule is a blocking gate; do not replace it with a catch-all Pages redirect,
which would also intercept the apex hostname.

## External and manual promotion gates

Each gate must have its own JSON proof and nested raw artifact under
`.agent/tasks/jq33-production-readiness-2026-07-29/raw/external/<gate-id>/`.
Never reuse one generic proof across gates. Every proof must be `PASS`, marked
redacted, fresh within the validator's accepted time window, and bound to the
same candidate run ID, source commit, artifact SHA-256, and immutable preview
URL. Each referenced raw artifact must remain inside that gate directory and
carry its verified SHA-256. Promotion evidence is text-only UTF-8 JSON with the
exact raw-capture envelope generated by the templates. Do not commit screenshots,
binary exports, full provider receipts, lead names, email addresses, message
text, tokens, private QA addresses, or other secrets. Convert provider results
to redacted counts, enums, public identifiers, and one-way hashes. Run
`pnpm evidence:check-redaction` before assembly; promotion and finalization rerun
the same fail-closed scanner.

The required gate IDs are:

1. `formspree-contact-delivery`: one accepted Contact request, one inbox
   receipt, and zero duplicate deliveries for its own endpoint/submission ID.
2. `formspree-inquiry-delivery`: the same exactly-once proof for the distinct
   Inquiry endpoint/submission ID.
3. `formspree-spam-retention`: spam protection enabled, retention no longer than
   the approved period, and deletion behavior confirmed.
4. `calendly-booking-cancel`: the published direct event books once, creates one
   invite, cancels once, and creates no extra event.
5. `social-profile-ownership`: each published HTTPS profile is controlled by
   JQ33 and resolves to the intended account.
6. `cloudflare-pages-web-analytics`: manual source injection, automatic Pages
   injection disabled, and a timestamped dashboard page view from the preview.
7. `dns-mx-spf-dkim-dmarc`: MX, one SPF policy, valid DKIM and DMARC, aligned
   authentication pass, and agreement from at least two resolvers.
8. `google-search-console`: domain ownership verified and the canonical sitemap
   accepted and fetchable.
9. `nvda-windows`: the required navigation, forms, FAQ, errors, and focus flows
   pass with NVDA on Windows.
10. `legal-privacy-retention`: legal sign-off covers processors, retention,
    deletion, contact details, and the published Privacy and Terms pages.
11. `browser-zoom-200`: all required route templates pass browser inspection at
    200% zoom without lost content or controls.
12. `schema-rich-results`: production-intended structured data validates with
    no blocking schema or rich-result errors.
13. `operational-privacy`: the real processor/data-flow inventory, retention,
    access, and deletion operations are verified end to end.

### Create the candidate-bound evidence workspace

After the preview job succeeds, download its sealed `candidate-attestation.json`
artifact and generate the operator workspace from that exact file:

```powershell
pnpm evidence:templates --candidate-attestation .\candidate-attestation.json
```

This validates the passing preview identity (run, clean `main` commit, artifact,
Pages deployment, Lighthouse/route/analytics seals, and hashed Formspree,
Calendly, social, and Cloudflare integration identities). It then creates a
concise index plus one deliberately non-passing `evidence.template.json` under
each of the 13 gate directories. Every template starts with `result: UNKNOWN`,
`checkedAt: null`, and null raw-artifact hashes, so generated scaffolding can
never authorize a promotion. If no social profiles were published in the sealed
candidate, the social template records an explicit zero count and empty list; it
does not invent profile URLs.

For each gate, add a redacted raw capture within its own directory, compute its
lowercase SHA-256, and fill the exact gate-specific semantics. Use one current
UTC ISO-8601 `checkedAt` value consistently in the raw reference, completed
proof, and strict root evidence. Verify any exposed endpoint, event, profile, or
analytics value hashes back to the sealed candidate identity. Then set
`redacted: true`, set `result: PASS`, and save the completed proof as that gate's
`evidence.json`. Then create the fresh verifier verdict and use the assembler
below to create, validate, and hash the strict root pre-promotion evidence before
dispatching with the exact candidate run, commit, and evidence hash.

A completed gate directory is deliberately narrow: `evidence.json`, one or more
`raw-capture.json` or `raw-capture-<slug>.json` files, and an optional generated
README only. Each raw capture is JSON and binds `candidateRunId`, `sourceCommit`,
`artifactSha256`, `previewUrl`, `detailsSha256`, and non-empty redacted
`observations` to the parent proof. Unreferenced files, binary files, alternate
proof names, whitespace-bearing identifiers, and nested directories fail closed.

The generator refuses any existing template workspace by default. `--force`
may refresh only the generated README, index, and unfinished template files; it
never overwrites a completed gate `evidence.json` or a nested raw capture.

### Assemble the strict pre-promotion record

After all 13 gate proofs are complete, copy the downloaded candidate
attestation byte-for-byte to its canonical in-repository location and run a
fresh proof-loop verifier against that candidate. The verifier must write
`verdict.json` with `PRE_PROMOTION_PASS`, the same run/commit/source-tree/artifact
identity, and exactly AC1 through AC13. AC2, AC9, AC10, AC11, and AC13 retain
their exact production-deferred scopes; every other criterion is a full `PASS`.

```powershell
New-Item -ItemType Directory -Force .\.agent\tasks\jq33-production-readiness-2026-07-29\raw\deployed-preview
Copy-Item .\candidate-attestation.json .\.agent\tasks\jq33-production-readiness-2026-07-29\raw\deployed-preview\candidate-attestation.json
pnpm evidence:assemble --candidate-attestation .\.agent\tasks\jq33-production-readiness-2026-07-29\raw\deployed-preview\candidate-attestation.json --force
```

Omit `--force` when no root `evidence.json` exists. The assembler never creates
gate proof or verdict content. It requires the canonical sealed preview copy,
checks candidate freshness and clean-main identity, validates every distinct
gate proof and nested artifact with the shared semantic validator, requires a
verdict less than 24 hours old, and runs the actual promotion validator against
a staged evidence file and staged resolved-blocker sentinel. Only after that
round trip passes does it replace `evidence.json`, deterministically render
`evidence.md`, set `problems.md` to the exact `RESOLVED` sentinel, and print the
dispatch SHA-256. An UNKNOWN
template, missing proof, stale or mismatched identity, malformed verdict, or
failed validation leaves the existing root evidence untouched.

Missing, stale, shared, unredacted, malformed, or candidate-mismatched evidence
is `UNKNOWN` or a hard validation failure; it is never waived and never
authorizes production. If any blocker is discovered, replace `problems.md` with
the blocker details before further release action. A passing validator accepts
only the exact generated `RESOLVED` sentinel, so unresolved prose and a passing
record cannot coexist.

### Assemble the terminal production record

After a successful `promote-production` run, download its immutable production
parity artifact and production diagnostics. Copy the validator-consumed files
to these canonical paths without editing them:

```text
.agent/tasks/jq33-production-readiness-2026-07-29/raw/promotion/evidence-validation.json
.agent/tasks/jq33-production-readiness-2026-07-29/raw/promotion/candidate-run-validation.json
.agent/tasks/jq33-production-readiness-2026-07-29/raw/deployed-production/production-parity-attestation.json
```

Retain the remaining redacted promotion, Cloudflare-production, and deployed-
production diagnostics under their matching `raw/` directories. Verify the
downloaded parity sidecar before copying. Do not copy Wrangler logs or provider
exports containing credentials or personal data.

Generate the sealed production-run binding from GitHub on a clean operator
machine. This command requires a read-only token in `GITHUB_TOKEN`; never write
the token to an artifact:

```powershell
$task = '.agent/tasks/jq33-production-readiness-2026-07-29'
New-Item -ItemType Directory -Force "$task/raw/finalization"
node scripts/ci-validate-candidate-run.mjs `
  --run-id <production-run-id> `
  --commit <production-run-commit-sha> `
  --repository <owner/repository> `
  --workflow-path .github/workflows/production-readiness.yml `
  --output "$task/raw/finalization/production-run-validation.json"
```

Run a fresh post-production verifier after the parity attestation exists. Its
`verdict.json` must be less than 24 hours old, use `overall_verdict: PASS`, judge
exactly AC1 through AC13 as `PASS`, and bind the candidate run and commit,
production run and production-run commit, source tree, artifact, production
deployment ID, and parity-attestation SHA-256. The verifier author must not be
the final environment approver. This role separation is enforced operationally
by the protected `production-finalization` environment; the repository cannot
cryptographically prove a local verdict author's identity.

Assemble and round-trip the terminal record with the same Node 22 toolchain:

```powershell
pnpm evidence:assemble-final `
  --production-attestation "$task/raw/deployed-production/production-parity-attestation.json" `
  --candidate-run-id <candidate-run-id> `
  --candidate-commit-sha <candidate-commit-sha> `
  --production-run-id <production-run-id> `
  --production-run-commit-sha <production-run-commit-sha> `
  --force
```

Omit `--force` when `final-evidence.json` does not exist. The assembler validates
the canonical candidate, promotion report, both GitHub run bindings, production
parity, and fresh all-PASS verdict; rejects every blocking word or mismatched
identity; runs the existing final validator against staged output; and only then
replaces `final-evidence.json`, the deterministic final `evidence.md`, and the
resolved `problems.md` sentinel. `evidence.json` remains the immutable
pre-promotion record. Commit only the finalization allowlist, then dispatch
`operation=finalize-production` with the exact four run/commit identities and the
two SHA-256 values printed or verified above. The workflow independently queries
the production run again, compares it with the committed run proof, rechecks
external-evidence redaction, and reruns the terminal validator before emitting
the finalization attestation.

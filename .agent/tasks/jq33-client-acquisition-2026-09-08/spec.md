# JQ33 client acquisition, trust, and site improvements

- Task ID: `jq33-client-acquisition-2026-09-08`
- Frozen: 2026-09-08, before this task's production implementation.
- Repository: `C:\Users\BELLWERK\Documents\PROJECTS\JQ33 DESIGN\WEB 2.0`
- Delivery boundary: locally implemented, reviewable website and owner materials; deployment and external account outcomes are outside this task's completion claim.

## Original task statement

The preceding user request was: "please go over the whole website, do a quick general audit, let me know what can we improve structure, seo or design wise, suggest some features or ideas that might help acquire new clients, build trust faster, or help seo etc"

The user then requested:

> Yes, please implement everything (use placeholders where needed, ask me questions for the any additional information you need).
>
> The only implementation change are the following points:
>
> - Keep the homepage small purple text over a busy photograph - removing this will hurt the visual identity, do not simplify the hero. Do not use calmer typography for longer titles.
> - "The [portfolio overview](https://jq33.design/projects/) shows polished AI visualizations, while detail pages show oversized placeholder diagrams. " - I'm working on creating a few project to fill out the place holders
> - "Visitors learn little about the person behind the studio. Add a real portrait, name, relevant experience, working approach, and genuine credentials. Add attributable client feedback and completed work when available. " - let's mention company's history (take it from linkedin) on the contact us page
> - "**Build a complete French journey.** Start with the homepage, Services, inquiry/contact, and booking instructions. Use separate language URLs and appropriate `hreflang` links. This follows [Google's multilingual guidance](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)." - we do not normally offer service in french

The accepted audit recommendations cover header/content overlap, navigation and page purposes, package scope, call and form expectations, journal completeness and practical buyer content, sample deliverables, a lease-preparation checklist, a small package-fit guide, a possible paid diagnostic, contextual calls to action, inquiry/booking/qualified-project measurement, and Google Business Profile review/setup guidance. The user's explicit overrides take precedence over the audit.

Before implementation, the user clarified the company-history request:

> ok i made a mistake, there is not much info on our linked in, the main point is that we create bold interiors and we have 8 years experience

This latest owner-provided description governs the Contact introduction; LinkedIn extraction is no longer required.

## Current repository facts and assumptions

- `AGENTS.md` and `CLAUDE.md` require a frozen spec, implementation against numbered criteria, evidence, and independent current-tree verification before completion.
- The checkout already contains substantial tracked and untracked user work. Preserve it; do not restore files from HEAD or overwrite historical task evidence. This task uses its own directory only.
- This is a static site with hand-authored pages plus generated projects/journal pages. `data/posts.json` and journal templates generate journal output; project data and visual assets belong to the user.
- Existing build pins are Node `22.23.2` and pnpm `11.13.0`. Existing browser checks cover responsive layout, accessibility, keyboard/navigation interactions, forms, media, runtime behavior, and direct Calendly links.
- The owner directly confirms bold interiors and eight years of design experience for the Contact introduction. Experience must not be rewritten as a company founding date or a fabricated eight-year corporate timeline. Do not infer a founder, credentials, employees, completed client work, awards, or outcomes. LinkedIn is optional rather than a required content dependency after the owner's clarification.
- English remains the sole service journey. No translation, French service promise, or language-route expansion is required.
- One `/planning-resources/` page may combine sample deliverables, the checklist, and package guidance to avoid unnecessary route complexity.
- Existing public prices are preserved. Where site measurement, response time, staffing, diagnostic pricing, or delivery promises need owner confirmation, use conservative conditional wording or clearly labeled drafts/placeholders. User-authorized placeholders can satisfy local implementation criteria only when their status is unmistakable and they do not create an active unsupported offer.

## Acceptance criteria

### AC1 — Preserve the owner's visual and portfolio constraints

Keep the existing homepage hero composition, photograph, small purple text treatment, and expressive heading font families. Do not replace longer-title typography with calmer fonts. Preserve `data/projects.json`, project imagery/diagrams, project descriptions, and existing concept/AI disclosures. Project-page changes are limited to shared shell/layout fixes and contextual inquiry links; do not populate or redesign the user-owned project material. Show a scoped diff and rendered homepage evidence confirming these constraints.

### AC2 — Correct shared header and heading geometry

Services, Inquiry, Contact, and new public content have readable initial headings below the fixed header and usable actions at 320, 375, 414, 768, 1280, and 1440px widths, including a 1280×720 viewport reproducing the audit finding. No material header/heading overlap or horizontal page overflow is introduced. Heading wrapping and spacing may change while preserving the specified font families and homepage hero treatment. Keyboard navigation, mobile drawer, skip links, and existing visible action controls remain usable.

### AC3 — Make navigation and page purposes clear

Services is prominent in desktop and mobile primary navigation, with an obvious project-starting link to Inquiry. Contact introduces the company and supports general questions; Inquiry remains the project-intake path. Preserve working project, journal, legal, and direct Calendly destinations. Update shared render sources/templates as needed so a clean build reproduces the navigation consistently; avoid a new empty Studio route.

### AC4 — Add the owner-confirmed company introduction on Contact

Add a concise company introduction built around bold interiors and eight years of design experience, as confirmed by the owner, with relevant existing verified business facts. Do not convert experience into a founding date or invent a founder biography, corporate timeline, testimonials, credentials, or achievements. Retain the owner clarification as provenance in this task's evidence. Additional unverifiable history is omitted or retained as an explicitly labeled owner draft; no fabricated placeholder facts. A LinkedIn link is optional and a LinkedIn history extraction is no longer required.

### AC5 — Explain packages, intake, and call expectations

Preserve the three existing package prices and distinguish included deliverables, suitable project situations, and limitations without unsupported technical/permit promises. Reconcile contradictory measurement language using scope-confirmed wording. Explain the existing 15-minute introductory call and the immediate next step. Put truthful response expectations before form submission; any unconfirmed service-level promise stays a draft. Use an accessible space-type selector on project intake where it improves the existing flow without adding an unnecessarily long questionnaire. Retain native form submission, enhanced success/error/retry behavior, labels, and validation.

### AC6 — Make journal content complete and useful

Publish three original, substantive English buyer guides covering commercial design costs, preparation before committing to a commercial lease, and salon space/layout planning, or an equally useful narrow title for each topic. Cost content distinguishes existing JQ33 package prices from construction budgets and does not invent market data. Planning content avoids unsupported legal/code assurances. Each published guide has a working detail route, useful practical guidance, honest authorship/dates, and a relevant service or inquiry action. Hide existing unfinished teasers from the published listing or clearly label them as unavailable without misleading clickable affordances; retain their source records for future work.

### AC7 — Provide a credible sample design package

Create a useful illustrative sample deliverable, accessible from Services and the consolidated resources page. It shows the structure and level of content a prospective client can discuss: brief, layout considerations, material direction, and decision/deliverable notes. Label it as an illustrative sample, with any unfilled visual slots clearly identified. Do not imply it is an actual client commission, promise it is included in every package, or repurpose user-owned project placeholders as finished proof.

### AC8 — Provide practical checklist and package guidance

Provide an ungated commercial lease-preparation checklist with both a readable web version and a working downloadable/printable artifact. Include useful information to gather and questions for the landlord, contractor, and designer without purporting to replace professional advice. Provide a small accessible package-fit guide that explains its recommendation or comparison and links to Inquiry; it must remain useful with JavaScript disabled. No complex calculator, account, or new external form/service is required.

### AC9 — Add contextual conversion paths and an honest diagnostic draft

Each existing concept study and each published article ends with a relevant inquiry/service action. Services and resources guide visitors toward choosing an existing package or discussing their space. Prepare a concrete draft for a paid space-planning diagnostic with proposed deliverable and the owner decisions needed to activate it. Unless the owner confirms commercial terms, keep it in this task's owner materials or visibly marked as unavailable/draft; no invented price, checkout, or active booking promise. Preserve the same direct Calendly event contract across active booking links.

### AC10 — Maintain coherent English SEO and route integrity

Give the homepage, Services, Contact, Inquiry, resources, and new guides distinct purposes, titles, descriptions, logical heading structures, and useful internal links. Extend sitemap, build publication allowlists, generated output, and route coverage to all new published pages. Canonicals remain correct, existing concept disclosures remain, and unpublished drafts do not become indexed landing pages. Keep English language declarations accurate; do not add French URLs or misleading multilingual/service metadata. Do not publish fabricated review, credential, or outcome structured data.

### AC11 — Make measurement and local-profile follow-through actionable

Capture practical bounded inquiry attribution (such as source/medium/campaign and landing/referrer information) through the existing intake flow, with safe defaults and no personal form content in analytics. Verify local payload and persistence behavior through controlled tests, without sending a real lead. Distinguish a booking-link click from an actual completed booking. Provide a usable owner workflow/template to reconcile completed Calendly bookings and qualified projects by source; only implement automated completion reporting if the existing integration can verify it. Provide an actionable Google Business Profile review/setup checklist using verified business facts; inspect/update an external listing only with identifiable authorized access. State explicitly what is locally verified and what still requires provider/account evidence. No fictitious analytics success or new external tracking service.

### AC12 — Retain evidence and pass independent current-tree checks

Retain `evidence.md`, `evidence.json`, raw command output, scoped change inventory, rendered screenshots, and owner inputs/drafts inside this task directory. Map every AC to current artifacts and a fresh independent verifier result. Rerun the existing applicable build/static/browser checks with the pinned toolchain, plus meaningful new coverage for changed behavior and new routes. Do not weaken checks to manufacture PASS, change historical evidence, or substitute local fixtures for provider/production proof. Any failed/unverified required local criterion prevents a completion claim; document failures, fix the smallest safe diff, and reverify. External publication/provider outcomes are explicitly excluded from local completion and must be reported as unverified rather than PASS.

## Constraints and non-goals

- No deployment, Git push, production changes, external messages, new paid services, actual form submission, or booking creation is required by this task.
- No French journey, homepage hero simplification, heading-font substitution, invented reviews/history/credentials, or portfolio replacement.
- No new roadmap, task renumbering, modification of historical task records, broad formatting, unrelated refactor, framework migration, or CMS rebuild.
- Preserve existing security, form endpoint validation, native/no-JavaScript behavior, consent/privacy expectations, direct booking endpoint restrictions, and local asset approach.
- Complete independent authorized work while owner answers are pending. Keep unresolved business decisions in a concise reviewable owner-input record; elapsed time does not authorize new promises or external actions.

## Verification plan

1. Record the existing dirty-tree inventory and relevant source hashes before implementation; compare the task diff against that baseline, including homepage hero/fonts and user-owned project data/assets.
2. Use actual Node `22.23.2` and pnpm `11.13.0` (`pnpm.cmd` on Windows). Keep the strict version checks intact. Default commands: `pnpm.cmd verify`, which performs build and `check:launch`; the latter includes frontend contracts, links, images, static publication/content/forms/HTML/security/SEO checks, and the existing browser suite.
3. Set `RAW_ARTIFACT_ROOT` and `PLAYWRIGHT_ARTIFACT_DIR` to this task's `raw/` paths before any checks. Current helper defaults point to a historical task and must not receive this task's evidence.
4. If production runtime settings are absent, the repository's explicit `build:test-fixtures` and `check:launch:test-fixtures` modes may establish local implementation behavior. Label that result fixture-only, preserve a record of unavailable strict/provider checks, and never treat it as deployment or inbox delivery proof. Do not print secrets.
5. Extend route inventory/coverage for published resources and guides. Add targeted behavior tests for header/heading clearance (including 1280×720), navigation destinations, package guidance, attribution success/error/native paths, safe booking semantics, and the downloadable checklist. Tests should assert user outcomes rather than only implementation strings.
6. Review desktop/mobile screenshots of the homepage, Services, Contact, Inquiry, resources, a new guide, and a representative concept study. Check keyboard/no-JavaScript functionality and download contents. Inspect generated content/sitemap/meta and confirm new public assets are deployed by the build rather than present only in source.
7. Have a fresh verifier rerun current checks and review every AC after implementation. Retain raw results and scoped source/build binding. Follow the repository fix/reverify loop for failures; do not claim overall completion until all local ACs are PASS.

# Task Spec: launch-setup-2026-05-24

## Metadata
- Task ID: launch-setup-2026-05-24
- Created: 2026-05-24
- Repo root: C:\Users\BELLWERK\Documents\PROJECTS\JQ33 DESIGN\WEB 2.0

## Original task statement
Start working on the website launch setup.

## Acceptance criteria
- AC1: Launch setup proof artifacts exist under `.agent/tasks/launch-setup-2026-05-24/`, and this spec is frozen before implementation.
- AC2: The repository exposes a single repeatable pre-launch command that runs the production build and static checks.
- AC3: Production runtime configuration requirements are represented by a committed template without exposing secrets.
- AC4: Local-only launch QA helper artifacts are excluded from git/deployment source hygiene.
- AC5: A fresh verification pass runs against the current codebase, including build, static checks, and a local Browser smoke test.

## Constraints
- Do not commit or invent production secrets.
- Do not modify unrelated generated page content unless required by the build.
- Preserve unrelated user changes.
- Keep task evidence in `.agent/tasks/launch-setup-2026-05-24/`.

## Verification plan
- Run `pnpm build`.
- Run the new pre-launch command.
- Run a local browser smoke test against key routes.
- Capture command output and Browser findings in task evidence.

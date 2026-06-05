# Problems: launch-setup-2026-05-24

## Browser local target blocked
- Status: OPEN
- Affected AC: AC5
- Details: Browser refused both `http://127.0.0.1:8123/` and `http://localhost:8123/` with `net::ERR_BLOCKED_BY_CLIENT`, then rejected `file://` navigation by URL policy.
- Smallest safe next fix: run Browser QA against an allowed Cloudflare Pages preview URL, or retry the local Browser check after the Browser client's localhost policy issue is resolved.

## Account-backed production setup remains manual
- Status: OPEN
- Affected AC: Launch readiness outside repo changes
- Details: Cloudflare Pages env vars, Supabase function secrets, Supabase function deployment, Search Console verification, and live form/admin upload testing require project credentials or dashboard access.
- Smallest safe next fix: apply `.env.example` values in the relevant dashboards, deploy Supabase functions, then run live submission tests.

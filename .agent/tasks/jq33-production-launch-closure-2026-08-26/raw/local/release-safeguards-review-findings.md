# Release-safeguard independent review and corrections

Reviewed: 2026-08-26  
Scope: `scripts/check-production-health.mjs`, both new workflows,
`package.json`, `.env.example`, and `DEPLOYMENT.md`

The first independent review found six concrete gaps:

1. permissive CSP directive values and any non-empty Permissions Policy could
   pass the monitor;
2. the monitor did not request a canonical project-detail route;
3. the local strict build did not fail closed on exact Node/pnpm versions;
4. the complete branch-protection contract was not documented;
5. the monitor self-test mutated only one route status; and
6. GitHub Actions used mutable major-version tags.

Smallest corrections applied within the frozen allowlist:

- exact CSP source allowlists and an exact least-privilege Permissions Policy;
- direct-200 monitoring for `/projects/bruton-place-iv/`;
- Node `22.23.2` and pnpm `11.13.0` build guards plus an exact package engine;
- explicit PR/strict-check/conversation/force-push/deletion/admin-bypass
  documentation;
- negative self-tests for route, CSP, HSTS, redirect, source isolation,
  navigation fingerprint, and distinct form-endpoint regressions; and
- full commit-SHA pins for checkout/setup-node `v4.4.0`.

The first corrective self-test rejected its own simplified valid fixture
because the new allowlist was stricter than that fixture. The fixture was
updated to the exact release policy; no production policy was weakened.
`release-safeguards-review-rerun.txt` records the fresh PASS.

# Problems: supabase-function-env-fallback-2026-06-05

No open problems. Initial authenticated lead POST failed because the deployed function read a mismatched `SUPABASE_ANON_KEY` value before Supabase's built-in `ANON_KEY`; the function now accepts all configured anon-key aliases.

@AGENTS.md

# Sprout — project notes

Private growth journal: parents record a child's posts/photos/videos, choose per post who sees it.
English UI with a Chinese option (next-intl, locale in a cookie). See README.md for the full feature list
and DEPLOY.md for production setup.

## Commands

- `npx supabase start` — local Postgres/Auth/Storage/Mailpit (needs Docker)
- `npm run dev` / `npm run build && npm start`
- `npm run typecheck`, `npm run lint`
- `npm run db:test` — pgTAP access-control tests (must stay green)
- `npm run db:types` — regenerate `src/lib/supabase/database.types.ts` after a migration
- `npm run e2e` — Playwright end-to-end flows against a running app on :3000 (see `e2e/run.sh`)

## Rules that matter

- **The database is the security boundary.** Every table has RLS; privileged multi-row work goes through
  SECURITY DEFINER functions. Any new table needs policies + column grants + pgTAP tests in
  `supabase/tests/database/`.
- Anonymous visitors (share links `/s/…`, public page `/c/…`) never read tables: SQL functions decide which
  posts are allowed, then the server loads only those with the admin client.
- Never show birth date, author names or "age at the time" on shared/public pages.
- The admin (service-role) client is only for trusted server events or after an explicit permission check
  with the user's client.
- New migrations: `npx supabase migration new <name>`; never edit a migration that's already been pushed to
  production — add a new one.
- All UI copy lives in `messages/en.json` and `messages/zh.json` (keys are type-checked; add both).

## Status (handed over from a Claude Code cloud session)

- MVP (weeks 1–4) done; repo pushed to GitHub `main`. Vercel auto-deploys `main`.
- Production Supabase project (US East) has all 4 migrations applied. Email confirmation is temporarily
  OFF (no custom domain yet, so no SMTP).
- Open issue: https://exposureplatform.vercel.app returned 500 after the first deploy. Next step: open
  `/api/health` on the deployed site — it reports which env var is missing/malformed (never values).
  Likely a malformed `NEXT_PUBLIC_SUPABASE_URL`. After changing NEXT_PUBLIC_* vars, redeploy.
- Before real families: buy a domain → SMTP (Resend) → turn email confirmation back on; fill the
  [bracketed] placeholders in `src/app/(legal)/` and get legal review; Supabase Pro for backups.
- v1.1 in progress. M1 live in production; M2 (Skills tab, `src/components/charts/`) committed locally, no migration. M1: `skills` + `skill_ratings` (migration 20261019140949), ratings on
  review posts, members-only. Next: M2 skills tab (radar + trends, hand-written SVG), M3 growth reports
  (print CSS → browser "Save as PDF"). Then teacher role; Stripe last.
- Deploy order for any migration: `npx supabase db push` to production first, then push code (Vercel
  deploys main on push; code that selects new tables 500s against an old schema).

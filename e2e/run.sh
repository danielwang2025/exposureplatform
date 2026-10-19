#!/usr/bin/env bash
# End-to-end checks against a running app + local Supabase.
# Prereqs: `npx supabase start`, `npm run build && npm start` (port 3000),
# and .env.local with SMTP_URL=smtp://127.0.0.1:54325 (Mailpit) for week 4.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env.local; set +a

node e2e/make-fixtures.mjs
for test in week1-members week2-posts week3-sharing week4-account v11-skills v11-skills-tab; do
  echo "== $test"
  node "e2e/$test.mjs"
done

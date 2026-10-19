# Sprout 🌱

A private place for parents to record a child's growth: timeline, projects, milestones and reviews. Content is family-only by default, and visibility is set per post.

## Tech stack

- **Next.js 16** (App Router, Server Actions) + TypeScript + Tailwind CSS 4
- **Supabase**: Postgres + Auth + Row Level Security. Every permission check lives in the database.
- **next-intl**: English by default, switchable to Chinese. The locale is stored in a cookie, so URLs don't change with the language.
- **Supabase Storage** (private bucket) for photos; **Mux** for video (signed playback).

## Local development

Requires Node 20+ and Docker.

```bash
npm install
npx supabase start          # start local Supabase (Postgres, Auth, mail catcher)
cp .env.example .env.local  # fill in PUBLISHABLE_KEY and SECRET_KEY from `npx supabase status`
npm run dev                 # http://localhost:3000
```

Locally, email confirmation is off, so you are signed in right after sign-up. All outgoing email (password resets, etc.) can be viewed in Mailpit: http://127.0.0.1:54324

## Photos and videos

- **Photos** are re-encoded in the browser (canvas → JPEG): EXIF/GPS is stripped, orientation is applied, and the long edge is capped at 2560px (thumbnails at 640px). The browser then uploads directly to the private `media` bucket using one-time signed URLs. Afterwards the server checks each file again with sharp and re-encodes it if it still carries any metadata.
- **Videos** upload directly to Mux (UpChunk). The `/api/webhooks/mux` webhook marks a video ready or failed. Playback is signed (`playback_policies: signed`), and the server issues a 6-hour token whenever a page renders. Videos longer than 5 minutes are rejected automatically and their quota is refunded.
- **Quota**: uploads count against the uploader. Space is reserved before an upload starts and settled to the actual size once it finishes. Deleting media, a post, or a child profile refunds the space.

### Setting up Mux (video stays hidden until this is configured)

1. Create a Mux account → Settings → Access Tokens: create a token with Mux Video read + write → `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET`
2. Settings → Signing Keys: create one → `MUX_SIGNING_KEY_ID` / `MUX_SIGNING_KEY_PRIVATE` (the base64 string as given)
3. Settings → Webhooks: URL `https://<your-domain>/api/webhooks/mux` → `MUX_WEBHOOK_SECRET`
4. For local webhook testing, expose port 3000 to the internet, e.g. with `ngrok http 3000`, and enter that URL in Mux.

## Common commands

| Command | Purpose |
|---|---|
| `npm run db:reset` | Recreate the local database and rerun all migrations |
| `npm run db:test` | Run the database permission tests (pgTAP) |
| `npm run db:types` | Regenerate `src/lib/supabase/database.types.ts` after changing the schema |
| `npm run typecheck` / `npm run lint` | Type checking / linting |
| `npm run e2e` | End-to-end flows in a real browser (needs local Supabase + `npm start` on :3000; see `e2e/run.sh`) |

The first time you run the e2e tests, install the browser: `npx playwright install chromium`. `e2e/mux-webhook.mjs` tests the video webhook; it needs a separate instance started with fake Mux variables (see the comments at the top of the file).

## Permission model

| Role | Capabilities |
|---|---|
| owner | Everything, plus invite and remove members, change roles, delete the child profile |
| editor | Edit the child profile; later, add and edit posts |
| viewer | View and comment |

- Each child profile has at least one owner. This is enforced by a database trigger.
- An invitation is bound to an email address. A forwarded link is useless to anyone else. Invitations expire after 14 days and can only be used once.
- Visibility levels, from narrowest to widest: `private` (guardians only) < `family` < `link` (anyone with the link) < `public`. A child's `max_visibility` caps the visibility of every post on that profile.

## Sharing outside the family

| Entry point | Who can see it | What it shows |
|---|---|---|
| Share link `/s/{token}` | Anyone with the link | Posts at `link` or `public` visibility; scope can be the whole profile, one project, or one post |
| Public page `/c/{address}` | Anyone | Posts at `public` visibility only; requires an owner-set address **and** the child's `max_visibility = public` |

- Only owners can create share links or set the public address. Links can have an expiry, can be revoked at any time, and record a view count.
- Anonymous visitors never read tables directly. The database functions `resolve_share` / `shared_post_ids` / `public_child` / `public_post_ids` compute which posts are allowed, and the server loads and signs only those.
- Public pages show no author name, birth date, or "age at the time" (a date plus an age would reveal the birth date); the header shows age in years only.
- Lowering the child's `max_visibility` takes effect immediately: every share link and the public page go dark.
- `/s/`, `/c/` and `/invite/` respond with `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`.

## Comments, email and maintenance

- **Comments/likes**: only signed-in members who can read the post; the owner can delete any comment. Never loaded on share links or the public page.
- **Invitation emails**: sent over SMTP when `SMTP_URL` + `EMAIL_FROM` are set (bilingual, English and Chinese); locally they land in Mailpit at http://127.0.0.1:54324. Without them, owners copy the link.
- **Account page**: storage used, data export (ZIP), account deletion (requires typing the email + password; profiles where you are the sole owner are deleted with you).
- **Daily cleanup** `/api/cron/cleanup` (requires `CRON_SECRET`): deletes uploads stuck pending for over 24 hours and refunds their quota, plus invitations and share links long expired.

## Directory structure

```
supabase/migrations/     schema, RLS policies, RPCs
supabase/tests/database/ pgTAP permission tests
messages/{en,zh}.json    UI copy
src/app/(auth)/          sign-up, login, password reset
src/app/(app)/           signed-in pages (dashboard, child profiles, settings)
src/app/invite/[token]/  invitation landing page
src/app/s/[token]/       share-link page (anonymous)
src/app/c/[slug]/        public page (anonymous)
src/components/timeline/ post cards, galleries, timeline (shared by member and public pages)
src/lib/data/            server-side data access
src/proxy.ts             session refresh + route protection
```

## Roadmap

- [x] Week 1: scaffold, accounts, child profiles, multiple guardians and invitations, English/Chinese
- [x] Week 2: posts (moments/milestones/reviews), photo upload (EXIF stripping + thumbnails), Mux video, timeline (grouped by month, age at the time), edit/delete
- [x] Week 3: projects, milestones wall, standalone post pages, share links (profile/project/post), custom-address public page
- [x] Week 4: comments and likes (family members only), account page (storage, data export, account deletion), invitation emails, daily cleanup job, Terms/Privacy drafts, security headers; see [DEPLOY.md](DEPLOY.md) for launch
- [ ] v1.1: Stripe paid upgrades, structured scores, growth reports, teacher role

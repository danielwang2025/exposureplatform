# Deploying Sprout

Target setup: **Vercel** (app + cron) · **Supabase** (Postgres, Auth, Storage) · **Mux** (video) · an **SMTP** email provider (e.g. Resend).

## 1. Accounts to create

- [ ] Supabase project. Pick a region close to your users (e.g. `us-east-1` or `eu-central-1`). The **Pro** plan adds daily backups and point-in-time recovery. Use it for real families' photos.
- [ ] Vercel project, connected to the Git repository
- [ ] Mux account (optional; video stays hidden until configured)
- [ ] Email provider with SMTP (e.g. Resend), with your sending domain verified (SPF/DKIM)
- [ ] A domain, e.g. `sprout.example.com`

## 2. Database

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push          # applies supabase/migrations, including the private "media" bucket
```

Then, in the Supabase dashboard:

- [ ] **Authentication → URL Configuration**: Site URL `https://<domain>`; Redirect URLs `https://<domain>/**`
- [ ] **Authentication → Providers → Email**: turn **Confirm email** on; minimum password length 8; turn on leaked-password protection
- [ ] **Authentication → SMTP**: use the same SMTP provider. The built-in sender is rate-limited and not meant for production.
- [ ] **Advisors → Security / Performance**: resolve anything flagged
- [ ] Copy the **publishable key** and the **secret key** (Project Settings → API)

## 3. Mux (video)

- [ ] Settings → Access Tokens: token with Mux Video **read + write**
- [ ] Settings → Signing Keys: create one (for private playback)
- [ ] Settings → Webhooks: `https://<domain>/api/webhooks/mux`, then copy the signing secret
- [ ] Upload one short test video after deploying and confirm it plays

## 4. Vercel environment variables (Production)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key |
| `SUPABASE_SECRET_KEY` | secret key (server only) |
| `NEXT_PUBLIC_SITE_URL` | `https://<domain>` |
| `SMTP_URL` | e.g. `smtps://resend:<api-key>@smtp.resend.com:465` |
| `EMAIL_FROM` | `Sprout <hello@<domain>>` |
| `CRON_SECRET` | long random string (`openssl rand -hex 32`) |
| `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET` | Mux access token |
| `MUX_WEBHOOK_SECRET` | Mux webhook signing secret |
| `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_KEY_PRIVATE` | Mux signing key (base64 private key as given) |

`vercel.json` schedules `/api/cron/cleanup` daily. Vercel sends `CRON_SECRET` with each call.

## 5. Before inviting real families

- [ ] Replace every `[bracketed]` placeholder in `src/app/(legal)/privacy` and `src/app/(legal)/terms`, and have both reviewed by a lawyer for your markets (COPPA / GDPR / UK GDPR / CCPA)
- [ ] Sign data processing agreements (DPAs) with Supabase, Vercel, Mux and the email provider
- [ ] `npm run db:test` passes against a local copy of the schema
- [ ] Smoke test on production:
  - [ ] Sign up → confirmation email arrives → log in
  - [ ] Create a child → post a photo → it shows on the timeline
  - [ ] Invite a second email address → email arrives → accept → viewer sees family posts, not private ones
  - [ ] Share link and public page show only what they should. Open them in a private window.
  - [ ] Account → Download my data produces a ZIP
  - [ ] Delete the test accounts

## Known limits (MVP)

- The data export is built in a single request. Very large accounts (several GB of photos) may hit the serverless function time limit. Move it to a background job if that happens.
- Videos are not included in the export (they're streamed from Mux).
- iPhone HEIC photos can't be decoded by Chrome. Safari on iOS converts them to JPEG automatically.
- There is no Content-Security-Policy yet. Add one once the set of third-party origins (Supabase, Mux) is final.

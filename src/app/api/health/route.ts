// Deployment self-check: open /api/health in a browser after deploying.
// Reports only whether each setting is present and well-formed — never values.
// Deliberately doesn't import src/lib/supabase/env.ts, which throws when
// configuration is missing.

export const dynamic = "force-dynamic";

type Check = { ok: boolean; detail: string };

function variable(name: string, value: string | undefined, pattern?: RegExp, hint?: string): Check {
  if (!value) return { ok: false, detail: `${name} is missing` };
  if (value !== value.trim()) return { ok: false, detail: `${name} has leading/trailing spaces` };
  if (pattern && !pattern.test(value)) return { ok: false, detail: `${name} looks wrong${hint ? `: ${hint}` : ""}` };
  return { ok: true, detail: "set" };
}

// Says what's off about a Supabase URL without echoing it.
function supabaseUrlProblem(value: string): string {
  if (/^["'].*["']$/.test(value)) return "it is wrapped in quotes; remove them";
  if (!/^https?:\/\//.test(value)) return "it doesn't start with https://";
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "it isn't a valid URL";
  }
  if (parsed.protocol !== "https:") return "it uses http:// instead of https://";
  if (!/^[a-z0-9]+\.supabase\.co$/.test(parsed.hostname)) {
    return parsed.hostname.endsWith("supabase.com")
      ? "it points at supabase.com (the dashboard), not <project-ref>.supabase.co"
      : "the host isn't <project-ref>.supabase.co";
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) return "it has a path or query after the domain (e.g. /rest/v1); remove it";
  if (value.endsWith("/")) return "it ends with a slash; remove it";
  return "unexpected format";
}

async function probe(url: string, headers: Record<string, string>): Promise<Check> {
  try {
    const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(8000) });
    return { ok: res.ok, detail: `HTTP ${res.status}` };
  } catch (error) {
    return { ok: false, detail: `unreachable (${error instanceof Error ? error.message : "error"})` };
  }
}

// Sign-up only works with the Email provider on. Confirmation emails need
// working SMTP, so flag "confirm email" when the app has no email configured.
async function emailSignup(url: string, publishable: string): Promise<Check> {
  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: publishable },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const settings = await res.json();
    if (settings.disable_signup) return { ok: false, detail: "sign-ups are disabled in Supabase Auth" };
    if (!settings.external?.email) {
      return { ok: false, detail: "the Email provider is off (Supabase → Authentication → Sign In / Providers → Email)" };
    }
    if (!settings.mailer_autoconfirm) {
      return { ok: true, detail: "on; new users must confirm their email, so Supabase needs working SMTP" };
    }
    return { ok: true, detail: "on; email confirmation is off" };
  } catch (error) {
    return { ok: false, detail: `couldn't read auth settings (${error instanceof Error ? error.message : "error"})` };
  }
}

// One object per migration, oldest first, that only exists once that migration
// has run. Keep this in step with supabase/migrations/ when adding one.
const migrationMarkers: { migration: string; probe: string }[] = [
  { migration: "20261019105910_init_profiles_children_members", probe: "profiles?select=id&limit=0" },
  { migration: "20261019111429_posts_and_media", probe: "media?select=id&limit=0" },
  { migration: "20261019113110_projects_sharing", probe: "share_links?select=id&limit=0" },
  { migration: "20261019114931_comments_likes", probe: "post_likes?select=post_id&limit=0" },
  { migration: "20261019140949_skills_ratings", probe: "skill_ratings?select=*&limit=0" },
  { migration: "20261019143630_reports", probe: "reports?select=*&limit=0" },
  // The teacher-role migrations only add an enum value and functions; billing
  // runs after them, so its marker implies they ran too.
  { migration: "20261019151638_billing", probe: "subscriptions?select=*&limit=0" },
  { migration: "20261020131714_rate_limits", probe: "rate_limits?select=key&limit=0" },
];

// Finds the first migration that hasn't been applied to this database.
async function migrations(url: string, secret: string): Promise<Check> {
  const headers = { apikey: secret, authorization: `Bearer ${secret}` };
  for (const marker of migrationMarkers) {
    const result = await probe(`${url}/rest/v1/${marker.probe}`, headers);
    if (!result.ok) {
      return {
        ok: false,
        detail:
          result.detail === "HTTP 404"
            ? `database is missing migrations from ${marker.migration} on. Run \`npx supabase db push\` from the project folder.`
            : `couldn't check ${marker.migration} (${result.detail})`,
      };
    }
  }
  return { ok: true, detail: `all ${migrationMarkers.length} checked migrations applied` };
}

export async function GET() {
  // Referenced literally so we see the values baked in at build time, which
  // is what the pages use. If these are missing, redeploy after setting them.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY;

  const checks: Record<string, Check> = {
    NEXT_PUBLIC_SUPABASE_URL: variable(
      "NEXT_PUBLIC_SUPABASE_URL",
      url,
      /^(https:\/\/[a-z0-9]+\.supabase\.co|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?)$/,
      "expected https://<project-ref>.supabase.co with no trailing slash or path",
    ),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: variable(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      publishable,
      /^(sb_publishable_|eyJ)/,
      "expected the publishable key (sb_publishable_…), not the secret key",
    ),
    SUPABASE_SECRET_KEY: variable(
      "SUPABASE_SECRET_KEY",
      secret,
      /^(sb_secret_|eyJ)/,
      "expected the secret key (sb_secret_…)",
    ),
    CRON_SECRET: variable("CRON_SECRET", process.env.CRON_SECRET),
  };
  if (url && !checks.NEXT_PUBLIC_SUPABASE_URL.ok && url === url.trim()) {
    checks.NEXT_PUBLIC_SUPABASE_URL.detail += ` (${supabaseUrlProblem(url)})`;
  }

  if (checks.NEXT_PUBLIC_SUPABASE_URL.ok && checks.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.ok) {
    checks.supabaseAuth = await probe(`${url}/auth/v1/settings`, { apikey: publishable! });
    if (checks.supabaseAuth.ok) checks.emailSignup = await emailSignup(url!, publishable!);
  }
  if (checks.NEXT_PUBLIC_SUPABASE_URL.ok && checks.SUPABASE_SECRET_KEY.ok) {
    checks.supabaseDatabase = await probe(`${url}/rest/v1/profiles?select=id&limit=1`, {
      apikey: secret!,
      authorization: `Bearer ${secret}`,
    });
    if (checks.supabaseDatabase.ok) checks.databaseMigrations = await migrations(url!, secret!);
  }

  const optional = {
    NEXT_PUBLIC_SITE_URL: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
    email: Boolean(process.env.SMTP_URL && process.env.EMAIL_FROM),
    video: Boolean(process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET),
    billing: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
  };

  const ok = Object.values(checks).every((c) => c.ok);
  return Response.json({ ok, checks, optional }, { status: ok ? 200 : 500 });
}

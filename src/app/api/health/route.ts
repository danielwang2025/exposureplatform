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

async function probe(url: string, headers: Record<string, string>): Promise<Check> {
  try {
    const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(8000) });
    return { ok: res.ok, detail: `HTTP ${res.status}` };
  } catch (error) {
    return { ok: false, detail: `unreachable (${error instanceof Error ? error.message : "error"})` };
  }
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

  if (checks.NEXT_PUBLIC_SUPABASE_URL.ok && checks.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.ok) {
    checks.supabaseAuth = await probe(`${url}/auth/v1/settings`, { apikey: publishable! });
  }
  if (checks.NEXT_PUBLIC_SUPABASE_URL.ok && checks.SUPABASE_SECRET_KEY.ok) {
    // Also confirms the migrations were pushed (the table exists).
    checks.supabaseDatabase = await probe(`${url}/rest/v1/profiles?select=id&limit=1`, {
      apikey: secret!,
      authorization: `Bearer ${secret}`,
    });
  }

  const optional = {
    NEXT_PUBLIC_SITE_URL: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
    email: Boolean(process.env.SMTP_URL && process.env.EMAIL_FROM),
    video: Boolean(process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET),
  };

  const ok = Object.values(checks).every((c) => c.ok);
  return Response.json({ ok, checks, optional }, { status: ok ? 200 : 500 });
}

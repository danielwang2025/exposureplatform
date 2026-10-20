// Rate limits on sign-in and password reset.
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { launch } from "./browser.mjs";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const run = Date.now();
const email = `ratelimit${run}@example.com`;
const PASSWORD = "correct-horse-1";
const step = (msg) => console.log("✓", msg);
const assert = (cond, msg) => { if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`); };

const browser = await launch();
const ip = `203.0.113.${1 + (run % 254)}`;
const page = await (await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": ip } })).newPage();

await page.goto(`${BASE}/signup`);
await page.fill("#displayName", "Rate Limit");
await page.fill("#email", email);
await page.fill("#password", PASSWORD);
await page.check('input[name="guardian"]');
await page.check('input[name="terms"]');
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/dashboard`);
await page.click('button:has-text("Log out")');
await page.waitForURL(`${BASE}/`);

async function attempt(password) {
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState("networkidle");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  // (Next.js also renders an empty role="alert" route announcer, so match by text.)
  const message = page.locator('form [role="alert"]', { hasText: /Incorrect email or password|Too many attempts/ });
  await message.waitFor();
  return message.innerText();
}

for (let i = 1; i <= 10; i++) {
  const message = await attempt("wrong-password");
  assert(message.includes("Incorrect email or password"), `attempt ${i}: ${message}`);
}
step("10 wrong passwords get the normal error");
assert((await attempt("wrong-password")).includes("Too many attempts"), "11th attempt is rate limited");
assert((await attempt(PASSWORD)).includes("Too many attempts"), "even the right password waits out the window");
step("11th attempt is blocked, including with the right password");

// A different visitor (new IP) is still blocked for this email: the limit is per account too.
const other = await (await browser.newContext()).newPage();
await other.goto(`${BASE}/login`);
await other.waitForLoadState("networkidle");
await other.fill("#email", email);
await other.fill("#password", PASSWORD);
await other.click('button[type="submit"]');
await other.locator('form [role="alert"]', { hasText: "Too many attempts" }).waitFor();
step("limit follows the account across IPs");

// Password reset: at most 3 per hour per email.
for (let i = 1; i <= 4; i++) {
  await page.goto(`${BASE}/forgot-password`);
  await page.waitForLoadState("networkidle");
  await page.fill("#email", email);
  await page.click('button[type="submit"]');
  const result = page.locator('main [role="alert"], main [role="status"]', { hasText: /reset link|Too many attempts/ });
  await result.waitFor();
  const text = await result.innerText();
  // Supabase also caps emails per hour for the whole project (2 locally), so
  // earlier answers depend on what else ran this hour; the 4th must be refused.
  if (i === 4) assert(text.includes("Too many attempts"), `4th reset is limited: ${text}`);
}
// …and our own per-email counter must have seen all four (limit 3).
const key = createHash("sha256").update(`resetEmail:${email}`).digest("hex");
const { data: counter } = await admin.from("rate_limits").select("hits").eq("key", key).single();
assert(counter?.hits === 4, `reset counter: ${JSON.stringify(counter)}`);
step("password reset is limited");

await browser.close();
console.log("ALL OK");

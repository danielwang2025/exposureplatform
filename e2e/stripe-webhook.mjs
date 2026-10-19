// Sprout Plus integration test against a server started with fake Stripe keys.
// Real Stripe API calls fail (no account), so we test: webhook signatures,
// the subscription state machine, quota and free-tier locks, what members see,
// the export, and that account deletion refuses while billing can't be stopped.
//
// Start the app on :3001 with fake Stripe settings first, e.g.:
//   npm run build
//   STRIPE_SECRET_KEY=sk_test_fake STRIPE_WEBHOOK_SECRET=whsec_e2e npx next start -p 3001
// then: set -a; source .env.local; set +a; node e2e/stripe-webhook.mjs
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");
const sharp = require("sharp");

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const SECRET = "whsec_e2e";
const SHOTS = new URL("./.output/shots/", import.meta.url).pathname;
const admin = createClient("http://127.0.0.1:54321", process.env.SUPABASE_SECRET_KEY);
const stripe = new Stripe("sk_test_fake");
const step = (msg) => console.log("✓", msg);
const assert = (cond, msg) => { if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`); };
const GiB = 1024 ** 3;

let clock = Math.floor(Date.now() / 1000);
async function hook(type, sub, { secret = SECRET, created = ++clock } = {}) {
  const payload = JSON.stringify({ id: `evt_${created}`, object: "event", created, type, data: { object: sub } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return fetch(`${BASE}/api/webhooks/stripe`, { method: "POST", headers: { "stripe-signature": header, "content-type": "application/json" }, body: payload });
}
const subscription = (id, status, interval = { interval: "year", interval_count: 1 }) => ({
  id,
  object: "subscription",
  customer: customerId,
  status,
  cancel_at_period_end: false,
  cancel_at: null,
  metadata: { user_id: userId },
  items: { object: "list", data: [{ id: `si_${id}`, current_period_end: clock + 365 * 86400, price: { id: "price_x", recurring: interval } }] },
});

// Fixture: a user with three ~1 GiB photos (bytes are set directly; the files
// themselves are small) and a Stripe customer, as the checkout action creates.
const run = Date.now();
const email = `plus${run}@example.com`;
const { data: created } = await admin.auth.admin.createUser({ email, password: "correct-horse-1", email_confirm: true, user_metadata: { display_name: "Pat" } });
const userId = created.user.id;
const customerId = `cus_e2e${run}`;
const { data: child } = await admin.from("children").insert({ nickname: "Kai", created_by: userId }).select().single();
await admin.from("child_members").insert({ child_id: child.id, user_id: userId, role: "owner" });
const { data: post } = await admin.from("posts").insert({ child_id: child.id, author_id: userId, title: "Summer", body: "Three photos", visibility: "family" }).select().single();
const jpeg = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#7cb342" } }).jpeg().toBuffer();
for (let i = 0; i < 3; i++) {
  const { data: m } = await admin.from("media").insert({ post_id: post.id, child_id: child.id, uploader_id: userId, kind: "image", status: "ready", bytes: GiB, position: i, width: 64, height: 64, created_at: new Date(Date.now() - (3 - i) * 86400000).toISOString() }).select().single();
  const paths = { storage_path: `${child.id}/${m.id}/full.jpg`, thumb_path: `${child.id}/${m.id}/thumb.jpg` };
  await admin.from("media").update(paths).eq("id", m.id);
  for (const p of Object.values(paths)) await admin.storage.from("media").upload(p, jpeg, { contentType: "image/jpeg" });
}
await admin.from("subscriptions").insert({ user_id: userId, stripe_customer_id: customerId });
const profile = async () => (await admin.from("profiles").select("storage_quota_bytes").eq("id", userId).single()).data.storage_quota_bytes;
const subRow = async () => (await admin.from("subscriptions").select("*").eq("user_id", userId).single()).data;
const lockedFlags = async () =>
  (await admin.from("media").select("locked, created_at").eq("uploader_id", userId).order("created_at")).data.map((m) => m.locked).join(",");

// Signatures.
assert((await hook("customer.subscription.created", subscription("sub_a", "active"), { secret: "whsec_wrong" })).status === 400, "wrong secret rejected");
const unsigned = await fetch(`${BASE}/api/webhooks/stripe`, { method: "POST", body: "{}" });
assert(unsigned.status === 400, "unsigned request rejected");
assert((await subRow()).status === null, "nothing changed by rejected events");
step("unsigned and wrongly signed events are rejected");

// Plus starts.
const createdAt = clock + 1;
assert((await hook("customer.subscription.created", subscription("sub_a", "active"))).status === 200, "event accepted");
let row = await subRow();
assert(row.status === "active" && row.billing_interval === "year" && row.current_period_end, "subscription stored");
assert((await profile()) === 100 * GiB, "quota raised to 100 GiB");
step("subscription.created → Plus with 100 GiB");

// An older event arriving late doesn't undo a newer state.
assert((await hook("customer.subscription.updated", subscription("sub_a", "canceled"), { created: createdAt - 10 })).status === 200, "stale accepted");
assert((await subRow()).status === "active", "stale event ignored");
// An ended *other* subscription doesn't cancel the active one.
await hook("customer.subscription.deleted", subscription("sub_old", "canceled"));
assert((await subRow()).status === "active", "other subscription's end ignored");
step("out-of-order and unrelated events are ignored");

// Account page and timeline with Plus.
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1100, height: 900 } })).newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.goto(`${BASE}/login`);
await page.fill("#email", email);
await page.fill("#password", "correct-horse-1");
await page.click('button[type="submit"]');
await page.waitForURL(/dashboard/);
await page.goto(`${BASE}/account`);
await page.waitForSelector("text=You have Sprout Plus.");
await page.waitForSelector("text=/Yearly · renews on/");
await page.waitForSelector("text=100 GB");
await page.goto(`${BASE}/children/${child.id}`);
await page.waitForSelector("h3:has-text('Summer')");
assert(await page.locator("article img").count() === 3, "all three photos shown with Plus");
step("account page shows Plus; all photos visible");

// Plus ends.
await hook("customer.subscription.deleted", subscription("sub_a", "canceled"));
assert((await profile()) === 2 * GiB, "quota back to 2 GiB");
assert((await lockedFlags()) === "false,false,true", `earliest 2 GiB visible, third locked: ${await lockedFlags()}`);
assert((await admin.from("media").select("id", { count: "exact", head: true }).eq("uploader_id", userId)).count === 3, "nothing deleted");
await page.reload();
await page.waitForSelector("text=Kept safe · shown with Plus");
assert(await page.locator("article img").count() === 2, "two photos shown, one locked");
await page.screenshot({ path: `${SHOTS}40-locked-media.png`, fullPage: true });
await page.goto(`${BASE}/account`);
await page.waitForSelector("text=/1 photo or video is kept safe but hidden/");
step("subscription.deleted → 2 GiB; third photo locked, not deleted");

// The export still includes everything.
const res = await page.request.get(`${BASE}/account/export`);
assert(res.ok(), "export works");
const dir = mkdtempSync(join(tmpdir(), "sprout-export-"));
const zipPath = join(dir, "export.zip");
(await import("node:fs")).writeFileSync(zipPath, await res.body());
const listing = execFileSync("unzip", ["-l", zipPath]).toString();
assert((listing.match(/photos\/.*\.jpg/g) ?? []).length === 3, "export has all three photos");
step("export includes locked photos");

// Plus again (monthly) unlocks.
await hook("customer.subscription.created", subscription("sub_b", "active", { interval: "month", interval_count: 1 }));
assert((await lockedFlags()) === "false,false,false", "unlocked again");
assert((await subRow()).billing_interval === "month", "interval updated");
// Cancelling in the Customer Portal sets cancel_at (not cancel_at_period_end).
const ending = { ...subscription("sub_b", "active", { interval: "month", interval_count: 1 }), cancel_at: clock + 30 * 86400 };
await hook("customer.subscription.updated", ending);
row = await subRow();
assert(row.cancel_at_period_end === true && row.status === "active", "portal cancel is shown as ending, Plus kept");
assert(Date.parse(row.current_period_end) === ending.cancel_at * 1000, "end date is the cancel_at date");
await page.goto(`${BASE}/account`);
await page.waitForSelector("text=/Monthly · ends on/");
step("portal cancellation (cancel_at) shows 'ends on' and keeps Plus until then");

// past_due keeps Plus while Stripe retries.
await hook("customer.subscription.updated", subscription("sub_b", "past_due", { interval: "month", interval_count: 1 }));
assert((await profile()) === 100 * GiB, "past_due keeps Plus");
await page.goto(`${BASE}/account`);
await page.waitForSelector("text=/Your last payment didn't go through/");
step("re-subscribing unlocks; past_due keeps Plus with a warning");

// Account deletion refuses while the subscription can't be cancelled.
await page.fill("#confirm", email);
await page.fill("#delete-password", "correct-horse-1");
page.once("dialog", (d) => d.accept());
await page.click('button:has-text("Delete my account")');
await page.waitForSelector("text=/Something went wrong/");
assert((await admin.auth.admin.getUserById(userId)).data.user, "account still exists");
step("account deletion refuses while billing can't be stopped");

await browser.close();
// Clean up the fixture.
await admin.from("subscriptions").delete().eq("user_id", userId);
await admin.from("children").delete().eq("id", child.id);
await admin.auth.admin.deleteUser(userId);
console.log("ALL OK");

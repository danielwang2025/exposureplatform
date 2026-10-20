// v1.1 M2 end-to-end: the Skills tab (radar, comparison table, trends) and
// that a viewer's charts only use ratings from posts they can read.
import { launch } from "./browser.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = new URL("./.output/shots/", import.meta.url).pathname;

const run = Date.now();
const alice = { name: "Alice", email: `alice-tab${run}@example.com` };
const val = { name: "Grandma Val", email: `val-tab${run}@example.com` };
const PASSWORD = "correct-horse-1";
const step = (msg) => console.log("✓", msg);
const assert = (cond, msg) => { if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`); };

const browser = await launch();

async function signup(page, user, next) {
  await page.goto(`${BASE}/signup${next ? `?next=${encodeURIComponent(next)}&email=${encodeURIComponent(user.email)}` : ""}`);
  await page.fill("#displayName", user.name);
  if (!next) await page.fill("#email", user.email);
  await page.fill("#password", PASSWORD);
  await page.check('input[name="guardian"]');
  await page.check('input[name="terms"]');
  await page.click('button[type="submit"]');
}

const ctxA = await browser.newContext({ viewport: { width: 1100, height: 900 } });
await ctxA.grantPermissions(["clipboard-read", "clipboard-write"]);
const a = await ctxA.newPage();
a.on("pageerror", (e) => console.log("PAGE ERROR (alice):", e.message));

await signup(a, alice);
await a.waitForURL(`${BASE}/dashboard`);
await a.goto(`${BASE}/children/new`);
await a.fill("#nickname", "Leo");
await a.check('input[name="consent"]');
await a.click('button:has-text("Create profile")');
await a.waitForURL(/\/children\/[0-9a-f-]+$/);
const childUrl = a.url();

// Empty states: no skills, then skills but no ratings.
await a.goto(`${childUrl}/skills`);
await a.waitForSelector("text=No skills to follow yet");
await a.click('a:has-text("Set up skills")');
await a.waitForURL(`${childUrl}/settings`);
for (const preset of ["Music", "Reading", "Sports"]) {
  await a.locator(`button:has-text("${preset}")`).first().click();
  await a.locator("li", { hasText: preset }).first().waitFor();
}
await a.goto(`${childUrl}/skills`);
await a.waitForSelector("text=No ratings yet");
await a.click('a:has-text("Write a review")');
await a.waitForSelector('[role="radio"][aria-checked="true"]:has-text("Review")');
step("empty states lead to settings, then to a pre-selected review");

// Three family reviews over a year, then a newer private one.
async function review(title, date, visibility, scores) {
  await a.goto(`${childUrl}/posts/new?kind=review`);
  await a.fill("#title", title);
  await a.fill("#occurredOn", date);
  await a.selectOption("#visibility", visibility);
  for (const [skill, score] of Object.entries(scores)) {
    await a.locator("fieldset li", { hasText: skill }).locator('[role="radio"]').nth(score - 1).click();
  }
  await a.click('button:has-text("Publish")');
  await a.waitForURL((u) => u.pathname === new URL(childUrl).pathname, { timeout: 30000 });
}
const iso = (monthsAgo) => {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
await review("Last autumn", iso(11), "family", { Music: 2, Reading: 2, Sports: 1 });
await review("Spring", iso(5), "family", { Music: 3, Reading: 3, Sports: 2 });
await review("This month", iso(0), "family", { Music: 4, Reading: 3 });
await review("Private note", iso(0), "private", { Music: 1 });
step("four reviews with ratings published");

await a.goto(`${childUrl}/skills`);
const radar = a.locator('svg[role="img"][aria-label*="compared with earlier"]');
await radar.waitFor();
assert(await radar.locator("polygon").count() >= 7, "radar has rings plus two series");
const row = (page, skill) => page.locator("tbody tr", { hasText: skill });
// Owner sees the private note (latest Music = 1) — same day as "This month",
// but created later, so it is the latest.
assert((await row(a, "Music").locator("td").nth(1).innerText()).startsWith("1"), "owner's latest Music is the private 1");
// Six months ago only "Last autumn" existed: Sports 1 → 2 since, Music 2 → 1 (private note).
assert((await row(a, "Sports").locator("td").nth(2).innerText()).includes("+1"), "sports up by one");
assert((await row(a, "Music").locator("td").nth(2).innerText()).includes("-1"), "music down by one for the owner");
await a.screenshot({ path: `${SHOTS}34-skills-tab.png`, fullPage: true, animations: "disabled" });

await a.click('a:has-text("12 months ago")');
await a.waitForURL(/compare=12/);
assert((await row(a, "Reading").locator("td").nth(2).innerText()).includes("New"), "no rating 12 months ago → New");
step("radar, table and compare ranges work");

// Trend markers link to their review.
const musicTrend = a.locator("div", { has: a.locator("h3", { hasText: "Music" }) }).locator('svg a').first();
await musicTrend.click();
await a.waitForSelector("h3:has-text('Last autumn')");
step("trend marker opens the review");

// Viewer: same tab, but the private review's rating is invisible.
await a.goto(`${childUrl}/settings`);
await a.fill("#invite-email", val.email);
await a.click('button:has-text("Create invitation")');
await a.waitForSelector("text=/Invitation (created|emailed)/");
await a.click('button:has-text("Copy link")');
const inviteUrl = await a.evaluate(() => navigator.clipboard.readText());
const v = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
v.on("pageerror", (e) => console.log("PAGE ERROR (val):", e.message));
await v.goto(inviteUrl);
await v.click("text=Create an account to accept");
await signup(v, val, new URL(inviteUrl).pathname);
await v.waitForURL(inviteUrl);
await v.click('button:has-text("Accept invitation")');
await v.waitForURL(childUrl);
await v.goto(`${childUrl}/skills`);
await row(v, "Music").waitFor();
assert((await row(v, "Music").locator("td").nth(1).innerText()).startsWith("4"), "viewer's latest Music ignores the private 1");
assert(await v.locator("text=Write a review").count() === 0, "viewer has no write action");
const overflow = await v.evaluate(() => document.documentElement.scrollWidth > innerWidth);
assert(!overflow, "no horizontal scroll on a phone");
await v.screenshot({ path: `${SHOTS}35-skills-tab-viewer-mobile.png`, fullPage: true, animations: "disabled" });
step("viewer's charts exclude private ratings; fits a phone");

// Chinese.
await a.goto(`${childUrl}/skills`);
await a.selectOption('select[aria-label="Language"]', "zh");
await a.waitForSelector("h2:has-text('变化趋势')");
assert(await a.locator("text=6 个月前").count() > 0, "compare chips in Chinese");
step("skills tab in Chinese");

await browser.close();
console.log("ALL OK");

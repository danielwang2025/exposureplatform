// v1.1 end-to-end: skills in settings, ratings on review posts, who sees them.
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = new URL("./.output/shots/", import.meta.url).pathname;

const run = Date.now();
const alice = { name: "Alice", email: `alice-skills${run}@example.com` };
const val = { name: "Grandma Val", email: `val-skills${run}@example.com` };
const PASSWORD = "correct-horse-1";
const step = (msg) => console.log("✓", msg);
const assert = (cond, msg) => { if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`); };

const browser = await chromium.launch();

async function signup(page, user, next) {
  await page.goto(`${BASE}/signup${next ? `?next=${encodeURIComponent(next)}&email=${encodeURIComponent(user.email)}` : ""}`);
  await page.fill("#displayName", user.name);
  if (!next) await page.fill("#email", user.email);
  await page.fill("#password", PASSWORD);
  await page.check('input[name="guardian"]');
  await page.check('input[name="terms"]');
  await page.click('button[type="submit"]');
}

const skillsSection = (page) => page.locator("section", { has: page.locator("h2", { hasText: /^Skills$/ }) });
const rateRow = (page, name) => page.locator("fieldset li", { hasText: name });

// --- Alice creates Mia, opens her to link sharing, invites Val ---
const ctxA = await browser.newContext({ viewport: { width: 1200, height: 900 } });
await ctxA.grantPermissions(["clipboard-read", "clipboard-write"]);
const a = await ctxA.newPage();
a.on("pageerror", (e) => console.log("PAGE ERROR (alice):", e.message));
const clipboard = () => a.evaluate(() => navigator.clipboard.readText());

await signup(a, alice);
await a.waitForURL(`${BASE}/dashboard`);
await a.goto(`${BASE}/children/new`);
await a.fill("#nickname", "Mia");
await a.fill("#birthDate", "2019-03-01");
await a.selectOption("#maxVisibility", "link");
await a.check('input[name="consent"]');
await a.click('button:has-text("Create profile")');
await a.waitForURL(/\/children\/[0-9a-f-]+$/);
const childUrl = a.url();

// A review before any skills exist points to settings.
await a.goto(`${childUrl}/posts/new`);
await a.click('[role="radio"]:has-text("Review")');
await a.waitForSelector("text=No skills to rate yet.");
assert(await a.locator('a:has-text("Set them up in Settings")').count() === 1, "links to settings");
step("review without skills points to settings");

// --- Settings: presets, custom, duplicate, rename, archive ---
await a.goto(`${childUrl}/settings`);
const skills = skillsSection(a);
await skills.locator("text=No skills yet.").waitFor();
await skills.locator('button:has-text("Music")').click();
await skills.locator("li", { hasText: "Music" }).waitFor();
await skills.locator('button:has-text("Reading")').click();
await skills.locator("li", { hasText: "Reading" }).waitFor();
assert(await skills.locator('button:has-text("+ 🎵 Music")').count() === 0, "added preset leaves the suggestions");
await skills.locator('input[name="emoji"]').last().fill("♟️");
await skills.locator('input[name="name"]').last().fill("Chess");
await skills.locator('button:has-text("Add")').click();
await skills.locator("li", { hasText: "Chess" }).waitFor();
await skills.locator('input[name="name"]').last().fill("music");
await skills.locator('button:has-text("Add")').click();
await skills.locator("text=There's already a skill with that name.").waitFor();
step("presets and a custom skill added; duplicate name rejected");

await skills.locator("li", { hasText: "Chess" }).locator('button:has-text("Rename")').click();
await skills.locator('li input[name="name"]').fill("Go");
await skills.locator('li button:has-text("Save")').click();
await skills.locator("li", { hasText: "Go" }).waitFor();
await skills.locator("li", { hasText: "Reading" }).locator('button:has-text("Archive")').click();
await skills.locator("summary", { hasText: "1 archived skill" }).waitFor();
await a.screenshot({ path: `${SHOTS}30-skills-settings.png`, fullPage: true });
step("skill renamed and one archived");

// --- Review with ratings ---
await a.goto(`${childUrl}/posts/new`);
await a.click('[role="radio"]:has-text("Review")');
await a.waitForSelector("text=Skill ratings");
assert(await rateRow(a, "Reading").count() === 0, "archived skill not offered for a new review");
assert(await a.locator('[role="radio"]:has-text("Moment")').count() === 1, "kind picker still there");
await a.fill("#title", "Autumn term");
await a.fill("#body", "Lots of practice this term.");
await a.selectOption("#visibility", "link");
await rateRow(a, "Music").locator('[role="radio"]').nth(3).click();
await rateRow(a, "Go").locator('[role="radio"]').nth(1).click();
await rateRow(a, "Music").locator("text=Proficient").waitFor();
await rateRow(a, "Go").locator("text=Beginning").waitFor();
await a.screenshot({ path: `${SHOTS}31-review-ratings.png`, fullPage: true, animations: "disabled" });
await a.click('button:has-text("Publish")');
await a.waitForURL((u) => u.pathname === new URL(childUrl).pathname, { timeout: 30000 });
const card = a.locator("article", { hasText: "Autumn term" });
await card.locator("li", { hasText: "Music" }).locator("text=Proficient").waitFor();
await card.locator("li", { hasText: "Go" }).locator("text=Beginning").waitFor();
step("review published with two ratings shown on the card");

// --- Edit: change one, clear one ---
const editUrl = `${childUrl}/posts/${(await card.getAttribute("id")).replace("post-", "")}/edit`;
await a.goto(editUrl);
await rateRow(a, "Music").locator('[role="radio"]').nth(4).click();
await rateRow(a, "Go").locator('[role="radio"]').nth(1).click(); // same star again clears
await rateRow(a, "Go").locator("text=Not rated").waitFor();
await a.click('button:has-text("Save changes")');
await a.waitForURL((u) => u.pathname === new URL(childUrl).pathname, { timeout: 30000 });
await card.locator("li", { hasText: "Music" }).locator("text=Excelling").waitFor();
assert(await card.locator("li", { hasText: "Go" }).count() === 0, "cleared rating is gone");
step("ratings edited: one changed, one cleared");

// --- Share link shows the review but never its ratings ---
await a.goto(`${childUrl}/settings`);
await a.click('button:has-text("Create share link")');
await a.waitForSelector("text=Link created and copied.");
const shareLink = await clipboard();
const anon = await (await browser.newContext()).newPage();
await anon.goto(shareLink);
await anon.waitForSelector("h3:has-text('Autumn term')");
assert(await anon.locator("text=Excelling").count() === 0, "share link hides ratings");
assert(await anon.locator("text=Music").count() === 0, "share link hides skill names");
step("share link shows the review without ratings");

// --- Val (viewer) sees ratings but can't manage skills ---
await a.goto(`${childUrl}/settings`);
await a.fill("#invite-email", val.email);
await a.click('button:has-text("Create invitation")');
await a.waitForSelector("text=/Invitation (created|emailed)/");
await a.click('button:has-text("Copy link")');
const inviteUrl = await clipboard();
const v = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
v.on("pageerror", (e) => console.log("PAGE ERROR (val):", e.message));
await v.goto(inviteUrl);
await v.click("text=Create an account to accept");
await signup(v, val, new URL(inviteUrl).pathname);
await v.waitForURL(inviteUrl);
await v.click('button:has-text("Accept invitation")');
await v.waitForURL(childUrl);
await v.locator("article", { hasText: "Autumn term" }).locator("text=Excelling").waitFor();
await v.goto(`${childUrl}/settings`);
await skillsSection(v).locator("li", { hasText: "Music" }).waitFor();
assert(await skillsSection(v).locator("button").count() === 0, "viewer has no skill controls");
await v.screenshot({ path: `${SHOTS}32-skills-viewer.png`, fullPage: true });
step("viewer sees ratings and a read-only skill list");

// --- Turning the review into a moment drops its ratings ---
await a.goto(editUrl);
await a.click('[role="radio"]:has-text("Moment")');
assert(await a.locator("text=Skill ratings").count() === 0, "rating field hidden for moments");
await a.click('button:has-text("Save changes")');
await a.waitForURL((u) => u.pathname === new URL(childUrl).pathname, { timeout: 30000 });
await a.locator("article", { hasText: "Autumn term" }).waitFor();
assert(await a.locator("article", { hasText: "Autumn term" }).locator("text=Excelling").count() === 0, "ratings dropped");
step("changing the type removes the ratings");

// --- Chinese ---
await a.goto(`${childUrl}/settings`);
await a.selectOption('select[aria-label="Language"]', "zh");
await a.waitForSelector("h2:has-text('能力项')");
await a.goto(`${childUrl}/posts/new`);
await a.click('[role="radio"]:has-text("点评")');
await a.waitForSelector("text=能力评分");
await a.screenshot({ path: `${SHOTS}33-review-ratings-zh.png`, fullPage: true });
step("skills UI in Chinese");

await browser.close();
console.log("ALL OK");

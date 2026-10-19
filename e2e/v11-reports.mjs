// v1.1 M3 end-to-end: growth reports — create, pick highlights, view, print
// to PDF, and what a viewer sees (no private posts, no private reports).
import { chromium } from "playwright";
import { statSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SP = new URL("./.output/", import.meta.url).pathname;
const SHOTS = `${SP}shots/`;
const FIX = `${SP}fixtures/`;

const run = Date.now();
const alice = { name: "Alice", email: `alice-rep${run}@example.com` };
const val = { name: "Grandma Val", email: `val-rep${run}@example.com` };
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

const ctxA = await browser.newContext({ viewport: { width: 1100, height: 900 } });
await ctxA.grantPermissions(["clipboard-read", "clipboard-write"]);
const a = await ctxA.newPage();
a.on("pageerror", (e) => console.log("PAGE ERROR (alice):", e.message));

await signup(a, alice);
await a.waitForURL(`${BASE}/dashboard`);
await a.goto(`${BASE}/children/new`);
await a.fill("#nickname", "Ivy");
await a.fill("#birthDate", "2020-02-02");
await a.check('input[name="consent"]');
await a.click('button:has-text("Create profile")');
await a.waitForURL(/\/children\/[0-9a-f-]+$/);
const childUrl = a.url();

// Material for the report: skills, a family milestone with photos, reviews,
// and a private moment that viewers must not count.
await a.goto(`${childUrl}/settings`);
for (const preset of ["Music", "Reading", "Sports"]) {
  await a.locator(`button:has-text("${preset}")`).first().click();
  await a.locator("li", { hasText: preset }).first().waitFor();
}
// Local calendar dates, as the browser (same machine) sees them.
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = ymd(new Date());
const daysAgo = (n) => ymd(new Date(Date.now() - n * 86_400_000));
async function post({ kind, title, date, visibility, files = [], scores = {} }) {
  await a.goto(`${childUrl}/posts/new?kind=${kind}`);
  await a.fill("#title", title);
  await a.fill("#occurredOn", date);
  await a.selectOption("#visibility", visibility);
  for (const [skill, score] of Object.entries(scores)) {
    await a.locator("fieldset li", { hasText: skill }).locator('[role="radio"]').nth(score - 1).click();
  }
  if (files.length) await a.setInputFiles('[data-testid="media-input"]', files);
  await a.click('button:has-text("Publish")');
  await a.waitForURL((u) => u.pathname === new URL(childUrl).pathname, { timeout: 30000 });
}
await post({ kind: "review", title: "Before the period", date: daysAgo(400), visibility: "family", scores: { Music: 2, Reading: 2, Sports: 3 } });
await post({ kind: "milestone", title: "First swim", date: today, visibility: "family", files: [`${FIX}gps.jpg`, `${FIX}big.png`] });
await post({ kind: "review", title: "Term review", date: today, visibility: "family", scores: { Music: 4, Reading: 3, Sports: 3 } });
await post({ kind: "moment", title: "Doctor visit", date: today, visibility: "private" });
step("posts, photos and ratings in place");

// Create: empty state → form with presets → straight to picking photos.
await a.goto(`${childUrl}/reports`);
await a.waitForSelector("text=No growth reports yet");
await a.click('a:has-text("New report")');
await a.fill("#title", "This month");
await a.click('button:has-text("This month")');
assert((await a.inputValue("#periodEnd")) === today, "preset fills the end date");
await a.fill("#summary", "Ivy swam on her own for the first time!");
await a.click('button:has-text("Create report")');
await a.waitForURL(/\/reports\/[0-9a-f-]+\/edit\?created=1$/);
await a.waitForSelector("text=Report created. Pick up to six favorite photos");
const pickers = a.locator('input[name="highlight"]');
assert(await pickers.count() === 2, "both photos from the period offered");
await a.locator("label:has(input[name=highlight])").first().click();
await a.waitForSelector("text=1 of 6 picked");
await a.click('button:has-text("Save report")');
await a.waitForURL(/\/reports\/[0-9a-f-]+$/);
const reportUrl = a.url();
step("report created; one highlight picked");

// View.
const stat = (label) => a.locator("dl div", { has: a.locator(`dt:text-is("${label}")`) }).locator("dd");
assert((await stat("Posts").innerText()) === "3", "owner counts 3 posts in the period (incl. private)");
assert((await stat("Milestones").innerText()) === "1", "1 milestone");
assert((await stat("Photos").innerText()) === "2", "2 photos");
await a.waitForSelector("text=Ivy swam on her own for the first time!");
assert(await a.locator('section[aria-labelledby="highlights"] img').count() === 1, "one highlight shown");
const skillRow = (page, name) => page.locator("tbody tr", { hasText: name });
assert((await skillRow(a, "Music").innerText()).includes("+2"), "music 2 → 4 over the period");
assert((await skillRow(a, "Sports").innerText()).includes("±0"), "sports unchanged");
await a.waitForSelector('section[aria-labelledby="milestones"] >> text=First swim');
await a.screenshot({ path: `${SHOTS}36-report.png`, fullPage: true, animations: "disabled" });
step("report shows stats, summary, highlight, skills and milestones");

// Print to PDF: header/buttons hidden, file produced.
await a.emulateMedia({ media: "print" });
assert(!(await a.locator('button:has-text("Download PDF")').isVisible()), "buttons hidden in print");
assert(!(await a.locator("header >> text=My children").isVisible()), "site header hidden in print");
await a.emulateMedia({ media: "screen" });
await a.pdf({ path: `${SHOTS}37-report.pdf`, format: "A4", printBackground: true });
assert(statSync(`${SHOTS}37-report.pdf`).size > 20_000, "PDF produced");
step("print layout hides chrome; PDF produced");

// A guardians-only report.
await a.goto(`${childUrl}/reports/new`);
await a.fill("#title", "Private notes");
await a.selectOption("#visibility", "private");
await a.click('button:has-text("Create report")');
await a.waitForURL(/edit\?created=1$/);

// Viewer: sees the family report with a viewer's numbers, not the private one.
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
await v.goto(`${childUrl}/reports`);
await v.waitForSelector("text=This month");
assert(await v.locator("text=Private notes").count() === 0, "viewer can't see the private report");
assert(await v.locator('a:has-text("New report")').count() === 0, "viewer can't create reports");
await v.goto(reportUrl);
const vstat = (label) => v.locator("dl div", { has: v.locator(`dt:text-is("${label}")`) }).locator("dd");
assert((await vstat("Posts").innerText()) === "2", "viewer's count leaves out the private post");
assert(await v.locator('a:has-text("Edit report")').count() === 0, "viewer can't edit");
assert(!(await v.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "report fits a phone");
await v.screenshot({ path: `${SHOTS}38-report-viewer-mobile.png`, fullPage: true, animations: "disabled" });
step("viewer sees family report only, with their own numbers");

// Delete.
await a.goto(`${reportUrl}/edit`);
a.once("dialog", (d) => d.accept());
await a.click('button:has-text("Delete report")');
await a.waitForURL(`${childUrl}/reports`);
assert(await a.locator("li >> text=This month").count() === 0, "report deleted");
step("report deleted");

// Chinese.
await a.selectOption('select[aria-label="Language"]', "zh");
await a.waitForSelector("text=新建报告");
step("reports in Chinese");

await browser.close();
console.log("ALL OK");

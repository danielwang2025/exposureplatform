// v1.1 end-to-end: the teacher role — invited by email, writes reviews with
// ratings, sees only reviews, can't reach the family's other content.
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SP = new URL("./.output/", import.meta.url).pathname;
const SHOTS = `${SP}shots/`;
const FIX = `${SP}fixtures/`;

const run = Date.now();
const alice = { name: "Alice", email: `alice-t${run}@example.com` };
const tina = { name: "Ms. Tina", email: `tina-t${run}@example.com` };
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
await a.fill("#nickname", "Noah");
await a.check('input[name="consent"]');
await a.click('button:has-text("Create profile")');
await a.waitForURL(/\/children\/[0-9a-f-]+$/);
const childUrl = a.url();

await a.goto(`${childUrl}/settings`);
for (const preset of ["Reading", "Math"]) {
  await a.locator(`button:has-text("${preset}")`).first().click();
  await a.locator("li", { hasText: preset }).first().waitFor();
}
async function post({ kind, title, visibility, files = [], scores = {} }) {
  await a.goto(`${childUrl}/posts/new?kind=${kind}`);
  await a.fill("#title", title);
  await a.selectOption("#visibility", visibility);
  for (const [skill, score] of Object.entries(scores)) {
    await a.locator("fieldset li", { hasText: skill }).locator('[role="radio"]').nth(score - 1).click();
  }
  if (files.length) await a.setInputFiles('[data-testid="media-input"]', files);
  await a.click('button:has-text("Publish")');
  await a.waitForURL((u) => u.pathname === new URL(childUrl).pathname, { timeout: 30000 });
}
await post({ kind: "moment", title: "Beach day", visibility: "family", files: [`${FIX}gps.jpg`] });
await post({ kind: "review", title: "Parent review", visibility: "family", scores: { Reading: 2 } });
await post({ kind: "review", title: "Private worries", visibility: "private", scores: { Math: 1 } });
step("family content in place");

// Invite a teacher.
await a.goto(`${childUrl}/settings`);
await a.fill("#invite-email", tina.email);
await a.selectOption("#invite-role", "teacher");
await a.click('button:has-text("Create invitation")');
await a.waitForSelector("text=/Invitation (created|emailed)/");
await a.locator("li", { hasText: tina.email }).locator("text=Teacher").waitFor();
await a.click('button:has-text("Copy link")');
const inviteUrl = await a.evaluate(() => navigator.clipboard.readText());
// Mailpit catches local email when SMTP_URL is set (see e2e/run.sh).
if (process.env.SMTP_URL) {
  const list = await fetch("http://127.0.0.1:54324/api/v1/messages?limit=50").then((r) => r.json());
  const msg = list.messages.find((m) => m.To.some((to) => to.Address === tina.email));
  assert(msg, "invitation email sent");
  const body = await fetch(`http://127.0.0.1:54324/api/v1/message/${msg.ID}`).then((r) => r.json());
  assert(body.Text.includes("as a teacher") && body.Text.includes("老师"), "invitation email names the teacher role");
}
step("teacher invited (pending invite and email say Teacher)");

// The teacher joins.
const t = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
t.on("pageerror", (e) => console.log("PAGE ERROR (teacher):", e.message));
await t.goto(inviteUrl);
await t.waitForSelector("text=Writes reviews and rates skills");
await t.click("text=Create an account to accept");
await signup(t, tina, new URL(inviteUrl).pathname);
await t.waitForURL(inviteUrl);
await t.click('button:has-text("Accept invitation")');
await t.waitForURL(childUrl);

await t.waitForSelector("h3:has-text('Parent review')");
assert(await t.locator("text=Beach day").count() === 0, "teacher can't see moments");
assert(await t.locator("text=Private worries").count() === 0, "teacher can't see private reviews");
const tabs = await t.locator("main nav a").allInnerTexts();
assert(tabs.join(",") === "Timeline,Skills", `teacher tabs are Timeline and Skills, got ${tabs}`);
for (const path of ["/milestones", "/projects", "/reports"]) {
  const res = await t.goto(`${childUrl}${path}`);
  assert(res.status() === 404, `teacher gets 404 on ${path}`);
}
step("teacher sees reviews only; other tabs hidden and 404");

// The teacher writes a review with ratings and a photo.
await t.goto(childUrl);
await t.click('a:has-text("New review")');
await t.waitForSelector("text=Skill ratings");
assert(!(await t.locator('[role="radiogroup"][aria-label="Type"]').isVisible()), "no type picker for teachers");
assert(await t.locator("select#visibility").count() === 0, "visibility is fixed");
await t.waitForSelector("text=Teachers' reviews are shared with the whole family.");
assert(await t.locator("#projectId").count() === 0, "no project picker");
await t.fill("#title", "Term 1 from school");
await t.fill("#body", "Noah reads aloud with confidence now.");
await t.locator("fieldset li", { hasText: "Reading" }).locator('[role="radio"]').nth(3).click();
await t.setInputFiles('[data-testid="media-input"]', [`${FIX}gps.jpg`]);
await t.click('button:has-text("Publish")');
await t.waitForURL((u) => u.pathname === new URL(childUrl).pathname, { timeout: 30000 });
const card = t.locator("article", { hasText: "Term 1 from school" });
await card.locator("text=Proficient").waitFor();
await card.locator("img").first().waitFor();
await t.screenshot({ path: `${SHOTS}39-teacher-timeline.png`, fullPage: true, animations: "disabled" });
step("teacher publishes a review with a rating and a photo");

// Edit rights: own review yes, parent's review no.
const parentCard = t.locator("article", { hasText: "Parent review" });
assert(await parentCard.locator('a:has-text("Edit"), button:has-text("Delete")').count() === 0, "no edit/delete on parent's review");
assert(await card.locator('a:has-text("Edit")').count() === 1, "edit on own review");
const reviewId = (await card.getAttribute("id")).replace("post-", "");
await t.goto(`${childUrl}/posts/${reviewId}/edit`);
await t.fill("#title", "Term 1 from school (updated)");
await t.click('button:has-text("Save changes")');
await t.waitForURL((u) => u.pathname === new URL(childUrl).pathname, { timeout: 30000 });
await t.waitForSelector("h3:has-text('Term 1 from school (updated)')");
const parentId = (await parentCard.getAttribute("id")).replace("post-", "");
const res = await t.goto(`${childUrl}/posts/${parentId}/edit`);
assert(res.status() === 404, "teacher can't open the editor for a parent's review");
step("teacher edits their own review only");

// The family sees it, and the teacher's rating counts on the Skills tab.
await a.goto(childUrl);
const fromTeacher = a.locator("article", { hasText: "Term 1 from school (updated)" });
await fromTeacher.locator("text=Ms. Tina").waitFor();
await a.goto(`${childUrl}/skills`);
const reading = a.locator("tbody tr", { hasText: "Reading" });
assert((await reading.locator("td").nth(1).innerText()).startsWith("4"), "teacher's rating is the latest Reading score");
step("family sees the teacher's review and rating");

// Owner can change the teacher into a viewer.
await a.goto(`${childUrl}/settings`);
await a.selectOption(`select[aria-label*="${tina.name}"]`, "viewer");
await a.waitForTimeout(1000);
await t.goto(childUrl);
await t.waitForSelector("h3:has-text('Beach day')");
step("owner can change a teacher's role");

await browser.close();
console.log("ALL OK");

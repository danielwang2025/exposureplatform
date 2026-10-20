// v1.1 end-to-end: project skills, scored reviews, progress chart, sharing.
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = new URL("./.output/shots/", import.meta.url).pathname;
const run = Date.now();
const PASSWORD = "correct-horse-1";
const step = (msg) => console.log("✓", msg);
const assert = (cond, msg) => { if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
const a = await ctx.newPage();
a.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));

// --- Setup: account, child (shareable by link), Piano project shared by link ---
await a.goto(`${BASE}/signup`);
await a.fill("#displayName", "Alice");
await a.fill("#email", `alice${run}@example.com`);
await a.fill("#password", PASSWORD);
await a.check('input[name="guardian"]');
await a.check('input[name="terms"]');
await a.click('button[type="submit"]');
await a.waitForURL(`${BASE}/dashboard`);
await a.goto(`${BASE}/children/new`);
await a.fill("#nickname", "Mia");
await a.fill("#birthDate", "2019-03-01");
await a.selectOption("#maxVisibility", "link");
await a.check('input[name="consent"]');
await a.click('button:has-text("Create profile")');
await a.waitForURL(/\/children\/[0-9a-f-]+$/);
const childUrl = a.url();
const childId = childUrl.split("/").pop();

await a.goto(`${childUrl}/projects/new`);
await a.fill("#title", "Piano");
await a.fill("#emoji", "🎹");
await a.selectOption("#visibility", "link");
await a.click('button:has-text("Create project")');
await a.waitForURL(/\/projects\/[0-9a-f-]+$/);
const projectUrl = a.url();

// --- Skills ---
await a.goto(`${projectUrl}/edit`);
await a.waitForLoadState("networkidle"); // let React hydrate before typing into controlled inputs
for (const name of ["Rhythm", "Sight-reading", "Expression"]) {
  await a.fill('input[aria-label="New skill"]', name);
  await a.click('button:has-text("+ Add")');
  await a.waitForSelector(`input[aria-label="Rename ${name}"]`);
}
await a.fill('input[aria-label="New skill"]', " rhythm ");
await a.click('button:has-text("+ Add")');
await a.waitForSelector("text=This project already has a skill with that name.");
const sight = a.locator('input[aria-label="Rename Sight-reading"]');
await sight.fill("Reading music");
await sight.blur();
await a.waitForSelector('input[aria-label="Rename Reading music"]');
step("skills: add, duplicate rejected, rename");

// --- Two scored reviews + an unscored moment ---
async function review({ date, title, scores, kind = "Review" }) {
  await a.goto(projectUrl);
  await a.click("text=+ Add progress");
  await a.waitForSelector("#body");
  await a.click(`[role="radio"]:has-text("${kind}")`);
  if (kind === "Review") {
    await a.waitForSelector("text=Skill scores");
    for (const [skill, n] of Object.entries(scores)) {
      await a.click(`button[aria-label="${skill} ${n}"]`);
    }
  } else {
    assert((await a.locator("text=Skill scores").count()) === 0, "no scoring on non-review posts");
  }
  await a.fill("#title", title);
  await a.fill("#body", `${title} notes`);
  await a.fill("#occurredOn", date);
  await a.selectOption("#visibility", "link");
  if (kind === "Review" && date === "2024-01-10") await a.screenshot({ path: `${SHOTS}40-score-input.png`, fullPage: true });
  await a.click('button:has-text("Publish")');
  await a.waitForURL((u) => u.pathname === `/children/${childId}`, { timeout: 30000 });
}
await review({ date: "2024-01-10", title: "Term 1 review", scores: { Rhythm: 2, "Reading music": 1, Expression: 3 } });
await review({ date: "2024-06-10", title: "Term 2 review", scores: { Rhythm: 4, "Reading music": 3, Expression: 3 } });
await review({ date: "2024-03-01", title: "Practice moment", kind: "Moment" });
step("two scored reviews and an unscored moment published");

// --- Post card shows scores ---
await a.goto(childUrl);
const card = a.locator("article", { hasText: "Term 2 review" });
const cardText = await card.innerText();
assert(cardText.includes("Rhythm") && cardText.includes("Reading music"), "scores on post card");
step("post card lists the scores");

// --- Progress chart ---
await a.goto(projectUrl);
await a.waitForSelector("h2:has-text('Progress')");
const rows = await a.locator('#progress-title >> xpath=ancestor::section//li[@tabindex="0"]').evaluateAll((els) =>
  els.map((el) => el.getAttribute("aria-label")),
);
assert(JSON.stringify(rows) === JSON.stringify([
  "Rhythm: first 2, latest 4 out of 5",
  "Reading music: first 1, latest 3 out of 5",
  "Expression: first 3, latest 3 out of 5",
]), `chart rows in skill order: ${JSON.stringify(rows)}`);
const chart = a.locator("section", { has: a.locator("#progress-title") });
assert((await chart.innerText()).includes("↑+2"), "delta shown");
await chart.locator(`li[tabindex="0"]`).first().hover();
await a.waitForSelector('[role="tooltip"]:has-text("Latest review")');
await a.screenshot({ path: `${SHOTS}41-progress.png`, fullPage: true });
await a.click("text=Show as table");
const tableRows = await chart.locator("tbody tr").allInnerTexts();
assert(tableRows.length === 2 && tableRows[0].includes("2") && tableRows[1].includes("4"), `table: ${tableRows}`);
step("progress chart: first→latest per skill, hover tooltip, table view");

// Edit a score → chart updates.
await a.goto(childUrl);
await a.locator("article", { hasText: "Term 2 review" }).locator('a:has-text("Edit")').click();
await a.waitForSelector('button[aria-label="Expression 3"][aria-checked="true"]');
await a.click('button[aria-label="Expression 5"]');
await a.click('button:has-text("Save changes")');
await a.waitForURL((u) => u.pathname === `/children/${childId}`);
await a.goto(projectUrl);
await a.waitForSelector('li[aria-label="Expression: first 3, latest 5 out of 5"]');
step("editing a review updates the chart");

// Dark mode render for a visual check.
const dark = await browser.newContext({ viewport: { width: 1200, height: 900 }, colorScheme: "dark", storageState: await ctx.storageState() });
const d = await dark.newPage();
await d.goto(projectUrl);
await d.waitForSelector("h2:has-text('Progress')");
await d.screenshot({ path: `${SHOTS}42-progress-dark.png`, fullPage: true });
await dark.close();

// --- Sharing ---
await a.goto(projectUrl);
await a.click('button:has-text("Create share link")');
await a.waitForSelector("text=Link created and copied.");
const projectLink = await a.evaluate(() => navigator.clipboard.readText());
const anon = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await anon.goto(projectLink);
await anon.waitForSelector("h2:has-text('Progress')");
await anon.waitForSelector('li[aria-label="Rhythm: first 2, latest 4 out of 5"]');
await anon.screenshot({ path: `${SHOTS}43-progress-shared-mobile.png`, fullPage: true });
step("project share link shows the progress chart");

// Make the project family-only; a whole-profile link may still show the
// link-visible review posts, but not the project's skill names or scores.
await a.goto(`${projectUrl}/edit`);
await a.selectOption("#visibility", "family");
await a.click('button:has-text("Save changes")');
await a.waitForURL(projectUrl);
await a.goto(`${childUrl}/settings`);
await a.click('button:has-text("Create share link")');
await a.waitForSelector("text=Link created and copied.");
const profileLink = await a.evaluate(() => navigator.clipboard.readText());
await anon.goto(profileLink);
await anon.waitForSelector("text=Term 2 review");
const shared = await anon.locator("main").innerText();
assert(!shared.includes("Rhythm") && !shared.includes("Reading music") && !shared.includes("Piano"),
  "unshared project's skills and name stay hidden on a profile link");
step("profile link hides skills of a project that isn't shared");

// --- Chinese ---
await a.selectOption('select[aria-label="Language"]', "zh");
await a.waitForSelector("text=家人与成员");
await a.goto(projectUrl);
await a.waitForSelector("h2:has-text('成长进度')");
await a.screenshot({ path: `${SHOTS}44-progress-zh.png`, fullPage: true });
step("progress chart in Chinese");

await browser.close();
console.log("ALL OK");

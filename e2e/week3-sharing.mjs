// Week 3 end-to-end: projects, milestones wall, share links, public page.
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SP = new URL("./.output/", import.meta.url).pathname;
const SHOTS = `${SP}shots/`;
const FIX = `${SP}fixtures/`;
const run = Date.now();
const PASSWORD = "correct-horse-1";
const step = (msg) => console.log("✓", msg);
const assert = (cond, msg) => { if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`); };

const browser = await chromium.launch();
const ctxA = await browser.newContext({ viewport: { width: 1200, height: 900 } });
await ctxA.grantPermissions(["clipboard-read", "clipboard-write"]);
const a = await ctxA.newPage();
a.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
const clipboard = () => a.evaluate(() => navigator.clipboard.readText());

// --- Setup: Alice + Mia (max visibility family) ---
await a.goto(`${BASE}/signup`);
await a.fill("#displayName", "Alice Chen");
await a.fill("#email", `alice${run}@example.com`);
await a.fill("#password", PASSWORD);
await a.check('input[name="guardian"]');
await a.check('input[name="terms"]');
await a.click('button[type="submit"]');
await a.waitForURL(`${BASE}/dashboard`);
await a.goto(`${BASE}/children/new`);
await a.fill("#nickname", "Mia");
await a.fill("#birthDate", "2020-05-01");
await a.check('input[name="consent"]');
await a.click('button:has-text("Create profile")');
await a.waitForURL(/\/children\/[0-9a-f-]+$/);
const childUrl = a.url();
const childId = childUrl.split("/").pop();

async function post({ body, title, date, visibility = "family", kind, files, projectPreselected }) {
  if (!projectPreselected) await a.goto(`${childUrl}/posts/new`);
  await a.waitForSelector("#body");
  if (kind) await a.click(`[role="radio"]:has-text("${kind}")`);
  if (title) await a.fill("#title", title);
  await a.fill("#body", body);
  await a.fill("#occurredOn", date);
  await a.selectOption("#visibility", visibility);
  if (files) await a.setInputFiles('[data-testid="media-input"]', files);
  await a.click('button:has-text("Publish")');
  await a.waitForURL((u) => u.pathname === `/children/${childId}`, { timeout: 30000 });
}

// --- Projects ---
await a.click('nav a:has-text("Projects")');
await a.waitForURL(/\/projects$/);
await a.waitForSelector("text=No projects yet");
await a.click("text=+ New project");
await a.fill("#emoji", "🎹");
await a.fill("#title", "Piano");
await a.fill("#description", "Lessons with Ms. Lee every Saturday.");
await a.click('button:has-text("Create project")');
await a.waitForURL(/\/projects\/[0-9a-f-]+$/);
const projectUrl = a.url();
const projectId = projectUrl.split("/").pop();
step("project created");

await a.click("text=+ Add progress");
await a.waitForSelector("#projectId");
assert((await a.inputValue("#projectId")) === projectId, "project preselected in composer");
await post({ body: "First lesson — learned middle C.", date: "2024-01-13", files: [`${FIX}gps.jpg`], projectPreselected: true });
await a.goto(projectUrl);
await a.click("text=+ Add progress");
await post({ title: "First recital", body: "Played Twinkle Twinkle at the recital!", date: "2024-06-08", kind: "Milestone", projectPreselected: true });
await post({ title: "First bike ride", body: "No training wheels!", date: "2024-03-02", kind: "Milestone", files: [`${FIX}big.png`] });
await post({ body: "Family-only moment.", date: "2024-04-01" });

await a.goto(projectUrl);
await a.waitForSelector("text=2 posts");
const projectOrder = await a.locator("article h3, article p.whitespace-pre-wrap").allInnerTexts();
assert(projectOrder[0].includes("middle C"), `project is oldest-first, got ${projectOrder[0]}`);
await a.screenshot({ path: `${SHOTS}20-project.png`, fullPage: true });
step("project page lists its 2 posts oldest-first");

await a.goto(childUrl);
await a.waitForSelector("article >> text=🎹 Piano");
step("timeline shows project chip");

await a.click('nav a:has-text("Milestones")');
await a.waitForURL(/\/milestones$/);
await a.waitForSelector("ol li");
await a.waitForSelector("text=First recital");
const wall = await a.locator("ol li").allInnerTexts();
assert(wall[0].includes("bike") && wall[1].includes("recital"), "milestones oldest first");
assert(wall[0].includes("3 years, 10 months"), `age on wall: ${wall[0]}`);
await a.screenshot({ path: `${SHOTS}21-milestones.png`, fullPage: true });
await a.click("text=First bike ride");
await a.waitForURL(/\/posts\/[0-9a-f-]+$/);
await a.waitForSelector("h3:has-text('First bike ride')");
step("milestones wall (oldest first, age shown) links to post page");

// --- Sharing is blocked while max visibility is family ---
await a.goto(`${childUrl}/settings`);
await a.waitForSelector("text=Share links");
assert(await a.locator("text=To share by link, set “Most anyone can see”").count() > 0, "explains why sharing is off");
step("share links disabled while profile is family-only");

// Open the profile to public, set an address.
await a.selectOption("#maxVisibility", "public");
await a.click('button:has-text("Save changes")');
await a.waitForSelector("text=Saved.");
await a.reload();
await a.fill("#slug", "Bad Slug!");
await a.click('button:has-text("Save address")');
await a.waitForSelector("text=Use 3–40 lowercase letters, numbers or single dashes.");
await a.fill("#slug", `mia-${run}`);
await a.click('button:has-text("Save address")');
await a.waitForSelector("text=Your public page is live at");
step("public address validated and saved");

await a.fill("#link-label", "For Grandpa Joe");
await a.click('button:has-text("Create share link")');
await a.waitForSelector("text=Link created and copied.");
const profileLink = await clipboard();
assert(/\/s\/[0-9a-f]{48}$/.test(profileLink), `profile link ${profileLink}`);
step("profile share link created");

// --- Change visibilities: bike ride → link, recital → public, project → link ---
async function setVisibility(title, visibility) {
  await a.goto(childUrl);
  await a.locator("article", { hasText: title }).locator('a:has-text("Edit")').click();
  await a.waitForSelector("h1:has-text('Edit post')");
  await a.selectOption("#visibility", visibility);
  await a.click('button:has-text("Save changes")');
  await a.waitForURL((u) => u.pathname === `/children/${childId}`);
}
await setVisibility("First bike ride", "link");
await setVisibility("First recital", "public");
await a.goto(`${projectUrl}/edit`);
await a.selectOption("#visibility", "link");
await a.click('button:has-text("Save changes")');
await a.waitForURL(projectUrl);
await a.click('button:has-text("Create share link")');
await a.waitForSelector("text=Link created and copied.");
const projectLink = await clipboard();
step("project share link created");

// Post share from the card menu (only on link/public posts).
await a.goto(childUrl);
assert(await a.locator("article", { hasText: "Family-only moment" }).locator('button:has-text("Share")').count() === 0,
  "no Share on family-only post");
await a.locator("article", { hasText: "First bike ride" }).locator('button:has-text("Share")').click();
await a.waitForSelector("text=Share link copied.");
const postLink = await clipboard();
step("single-post share link created from the card");

// --- Anonymous visitor ---
const anon = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const texts = async () => anon.locator("main").innerText();

let res = await anon.goto(profileLink);
assert(res.status() === 200, `profile link status ${res.status()}`);
assert(res.headers()["referrer-policy"] === "no-referrer", "no-referrer on share page");
let body = await texts();
assert(body.includes("First bike ride") && body.includes("First recital"), "profile link shows link + public posts");
assert(!body.includes("Family-only") && !body.includes("middle C"), "profile link hides family posts");
assert(!body.includes("Alice"), "no author names on shared pages");
assert(!/\d+ years?, \d+ months?/.test(body), "no age-at-the-time on shared pages");
assert(body.includes("🎹 Piano"), "link-shared project named");
const img = await anon.locator("article img").first().getAttribute("src");
assert((await fetch(img)).ok, "shared photo loads for anonymous visitor");
await anon.screenshot({ path: `${SHOTS}22-shared-mobile.png`, fullPage: true });
step("anonymous profile link: right posts, no author/age, photos load");

await anon.goto(projectLink);
body = await texts();
assert(body.includes("Piano") && body.includes("Lessons with Ms. Lee"), "project header shown");
assert(body.includes("First recital") && !body.includes("bike") && !body.includes("middle C"),
  "project link shows only shareable posts of the project");
step("anonymous project link: only the project's shareable posts");

await anon.goto(postLink);
body = await texts();
assert(body.includes("First bike ride") && !body.includes("recital"), "post link shows one post");
step("anonymous post link: exactly one post");

res = await anon.goto(`${BASE}/c/mia-${run}`);
body = await texts();
assert(res.status() === 200 && body.includes("Mia's public page"), "public page live");
assert(body.includes("First recital") && !body.includes("bike") && !body.includes("Family-only"), "public page shows only public posts");
assert(!body.includes("Piano"), "link-only project is not named on the public page");
await anon.screenshot({ path: `${SHOTS}23-public.png`, fullPage: true });
step("public page shows only public posts");

// Members' pages are not reachable anonymously.
await anon.goto(childUrl);
assert(anon.url().includes("/login"), "child page redirects anonymous visitor to login");
step("member pages still require login");

// --- Owner sees views, revokes, narrows visibility ---
await a.goto(`${childUrl}/settings`);
await a.waitForSelector("text=For Grandpa Joe");
const linkRow = await a.locator("li", { hasText: "For Grandpa Joe" }).innerText();
assert(linkRow.includes("Opened once"), `view count shown: ${linkRow}`);
await a.screenshot({ path: `${SHOTS}24-sharing-settings.png`, fullPage: true });
a.once("dialog", (d) => d.accept());
await a.locator("li", { hasText: "For Grandpa Joe" }).locator('button:has-text("Revoke")').click();
await a.waitForFunction(() => !document.body.innerText.includes("For Grandpa Joe"));
res = await anon.goto(profileLink);
assert(res.status() === 404, `revoked link → 404, got ${res.status()}`);
step("view count shown; revoked link stops working");

await a.selectOption("#maxVisibility", "family");
await a.click('button:has-text("Save changes")');
await a.waitForSelector("text=Saved.");
for (const url of [projectLink, postLink, `${BASE}/c/mia-${run}`]) {
  res = await anon.goto(url);
  assert(res.status() === 404, `${url} → 404 after narrowing, got ${res.status()}`);
}
step("narrowing max visibility to family turns off every link and the public page");

// --- Chinese UI on projects ---
await a.selectOption('select[aria-label="Language"]', "zh");
await a.waitForSelector("text=家人与成员");
await a.goto(`${childUrl}/projects`);
await a.waitForSelector("text=2 条记录");
await a.screenshot({ path: `${SHOTS}25-projects-zh.png` });
step("projects list in Chinese");

await browser.close();
console.log("ALL OK");

import { launch } from "./browser.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = new URL("./.output/shots/", import.meta.url).pathname;
const run = Date.now();
const alice = { name: "Alice", email: `alice${run}@example.com` };
const bob = { name: "Bob", email: `bob${run}@example.com` };
const PASSWORD = "correct-horse-1";

const browser = await launch();
const step = (msg) => console.log("✓", msg);

async function signup(page, user, next) {
  await page.goto(`${BASE}/signup${next ? `?next=${encodeURIComponent(next)}&email=${encodeURIComponent(user.email)}` : ""}`);
  await page.fill("#displayName", user.name);
  if (!next) await page.fill("#email", user.email);
  await page.fill("#password", PASSWORD);
  await page.check('input[name="guardian"]');
  await page.check('input[name="terms"]');
  await page.click('button[type="submit"]:has-text("Create account")');
}

// --- Alice: validation, sign up, create child ---
const ctxA = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const a = await ctxA.newPage();
await a.goto(BASE);
await a.screenshot({ path: `${SHOTS}01-landing.png` });

await a.goto(`${BASE}/signup`);
await a.click('button[type="submit"]');
await a.waitForSelector("text=This field is required.");
step("signup validation shows errors");

await signup(a, alice);
await a.waitForURL(`${BASE}/dashboard`);
await a.waitForSelector("text=You haven't added a child yet.");
await a.screenshot({ path: `${SHOTS}02-dashboard-empty.png` });
step("alice signed up and landed on empty dashboard");

await a.click("text=+ Add a child");
await a.fill("#nickname", "Mia");
await a.fill("#birthDate", "2020-05-01");
await a.click('button:has-text("Create profile")');
await a.waitForSelector("text=Please confirm to continue.");
step("guardian consent is required");
await a.check('input[name="consent"]');
await a.click('button:has-text("Create profile")');
await a.waitForURL(/\/children\/[0-9a-f-]+$/);
const childUrl = a.url();
await a.waitForSelector("h1:has-text('Mia')");
await a.screenshot({ path: `${SHOTS}03-child.png` });
step(`child created at ${childUrl}`);

// --- Invite Bob ---
await a.goto(`${childUrl}/settings`);
await a.fill("#invite-email", bob.email);
await a.selectOption("#invite-role", "editor");
await a.click('button:has-text("Create invitation")');
await a.waitForSelector("text=/Invitation (created|emailed)/");
await ctxA.grantPermissions(["clipboard-read", "clipboard-write"]);
await a.click('button:has-text("Copy link")');
const inviteUrl = await a.evaluate(() => navigator.clipboard.readText());
await a.screenshot({ path: `${SHOTS}04-settings.png`, fullPage: true });
step(`invitation created: ${inviteUrl}`);

// --- A stranger can't open the child page ---
const ctxC = await browser.newContext();
const c = await ctxC.newPage();
await signup(c, { name: "Carol", email: `carol${run}@example.com` });
await c.waitForURL(`${BASE}/dashboard`);
const res = await c.goto(childUrl);
if (res.status() !== 404) throw new Error(`stranger got ${res.status()} on child page`);
step("stranger gets 404 on child page");
await c.goto(inviteUrl);
await c.waitForSelector("text=You're signed in as");
step("stranger sees wrong-account message on invite link");

// --- Bob: invite page -> sign up -> accept ---
const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
const b = await ctxB.newPage();
await b.goto(inviteUrl);
await b.waitForSelector("text=Alice invited you to join Mia's profile on Sprout as an editor.");
await b.screenshot({ path: `${SHOTS}05-invite-mobile.png` });
await b.click("text=Create an account to accept");
await signup(b, bob, new URL(inviteUrl).pathname);
await b.waitForURL(inviteUrl);
await b.click('button:has-text("Accept invitation")');
await b.waitForURL(childUrl);
step("bob accepted invitation and sees Mia");

// Bob (editor) can edit details but has no delete/invite controls.
await b.goto(`${childUrl}/settings`);
if (await b.locator("text=Delete profile").count()) throw new Error("editor sees delete");
if (await b.locator("text=Invite someone").count()) throw new Error("editor sees invite form");
await b.fill("#nickname", "Mia-Rose");
await b.click('button:has-text("Save changes")');
await b.waitForSelector("text=Saved.");
step("editor can rename child; no owner controls shown");

// Invite link can't be reused.
await b.goto(inviteUrl);
await b.waitForSelector("text=This invitation has already been used.");
step("invitation cannot be reused");

// --- Language switch to Chinese ---
await a.goto(`${childUrl}/settings`);
await a.selectOption('select[aria-label="Language"]', "zh");
await a.waitForSelector("text=家人与成员");
await a.screenshot({ path: `${SHOTS}06-settings-zh.png`, fullPage: true });
await a.goto(`${BASE}/dashboard`);
await a.waitForSelector("h1:has-text('我的孩子')");
await a.screenshot({ path: `${SHOTS}07-dashboard-zh.png` });
step("language switch to Chinese persists");

// Last owner cannot demote themselves.
await a.goto(`${childUrl}/settings`);
await a.selectOption(`select[aria-label="修改 Alice 的角色"]`, "viewer");
await a.waitForSelector("text=每个孩子档案至少需要一位所有者");
step("last owner cannot demote themselves");

// Owner deletes the profile.
await a.fill("#confirm", "Mia-Rose");
await a.click('button:has-text("删除档案")');
await a.waitForURL(`${BASE}/dashboard`);
await a.waitForSelector("text=你还没有添加孩子。");
step("owner deleted child profile");

await browser.close();
console.log("ALL OK");

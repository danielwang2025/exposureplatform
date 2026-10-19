// Week 4 end-to-end: invitation email, likes & comments, export, cleanup cron,
// account deletion, legal pages, security headers.
import { chromium } from "playwright";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const { unzipSync, strFromU8 } = require("fflate");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SP = new URL("./.output/", import.meta.url).pathname;
const SHOTS = `${SP}shots/`;
const FIX = `${SP}fixtures/`;
const admin = createClient("http://127.0.0.1:54321", process.env.SUPABASE_SECRET_KEY);
const run = Date.now();
const PASSWORD = "correct-horse-1";
const alice = { name: "Alice", email: `alice${run}@example.com` };
const val = { name: "Grandma Val", email: `val${run}@example.com` };
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

// --- Security headers & legal pages (anonymous) ---
let res = await fetch(`${BASE}/`);
assert(res.headers.get("x-frame-options") === "DENY", "X-Frame-Options");
assert(res.headers.get("x-content-type-options") === "nosniff", "nosniff");
assert(!res.headers.get("x-powered-by"), "no X-Powered-By");
res = await fetch(`${BASE}/s/${"0".repeat(48)}`);
assert(res.headers.get("referrer-policy") === "no-referrer", `share pages keep no-referrer, got ${res.headers.get("referrer-policy")}`);
step("security headers set; share pages keep no-referrer");

const anonCtx = await browser.newContext();
const anon = await anonCtx.newPage();
await anon.goto(`${BASE}/signup`);
const termsHref = await anon.locator('label:has(input[name="terms"]) a').first().getAttribute("href");
assert(termsHref === "/terms", "signup links to terms");
await anon.goto(`${BASE}/privacy`);
await anon.waitForSelector("h1:has-text('Privacy Policy')");
await anon.goto(`${BASE}/terms`);
await anon.waitForSelector("h1:has-text('Terms of Service')");
await anon.waitForSelector("footer >> text=Privacy Policy");
step("legal pages render and are linked from signup and footer");

// --- Alice: child, family post with photo, invite Val by email ---
const ctxA = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const a = await ctxA.newPage();
a.on("pageerror", (e) => console.log("PAGE ERROR (alice):", e.message));
await signup(a, alice);
await a.waitForURL(`${BASE}/dashboard`);
await a.goto(`${BASE}/children/new`);
await a.fill("#nickname", "Mia");
await a.check('input[name="consent"]');
await a.click('button:has-text("Create profile")');
await a.waitForURL(/\/children\/[0-9a-f-]+$/);
const childUrl = a.url();
const childId = childUrl.split("/").pop();
await a.goto(`${childUrl}/posts/new`);
await a.fill("#body", "Mia's first painting");
await a.selectOption("#visibility", "family");
await a.setInputFiles('[data-testid="media-input"]', [`${FIX}gps.jpg`]);
await a.click('button:has-text("Publish")');
await a.waitForURL((u) => u.pathname === `/children/${childId}`, { timeout: 30000 });
await a.waitForSelector("article >> text=Comment");

await a.goto(`${childUrl}/settings`);
await a.fill("#invite-email", val.email);
await a.click('button:has-text("Create invitation")');
await a.waitForSelector(`text=Invitation emailed to ${val.email}`);
const mail = await (await fetch(`http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(`to:${val.email}`)}`)).json();
assert(mail.messages.length === 1, `one email to Val, got ${mail.messages.length}`);
const message = await (await fetch(`http://127.0.0.1:54324/api/v1/message/${mail.messages[0].ID}`)).json();
assert(message.Subject.includes("Alice invited you to Mia's journal"), `subject: ${message.Subject}`);
const inviteUrl = message.Text.match(/http\S+\/invite\/[0-9a-f]+/)[0];
assert(message.Text.includes("接受邀请"), "email is bilingual");
step(`invitation email delivered (bilingual) with link ${inviteUrl}`);

// --- Val joins from the email, likes and comments ---
const ctxV = await browser.newContext({ viewport: { width: 390, height: 844 } });
const v = await ctxV.newPage();
await v.goto(inviteUrl);
await v.click("text=Create an account to accept");
await signup(v, val, new URL(inviteUrl).pathname);
await v.waitForURL(inviteUrl);
await v.click('button:has-text("Accept invitation")');
await v.waitForURL(childUrl);

await v.click('button[aria-label="Like"]');
await v.waitForSelector('button[aria-label="Unlike"]:has-text("1")');
await v.reload();
await v.waitForSelector('button[aria-label="Unlike"]:has-text("1")');
step("viewer likes a post (persists after reload)");

await v.click("article >> text=Comment");
await v.waitForURL(/\/posts\/[0-9a-f-]+#comments$/);
const postUrl = v.url().split("#")[0];
await v.fill("#comment-body", "So proud of you, Mia! 🎨");
await v.click('button:has-text("Comment")');
await v.waitForSelector("li >> text=So proud of you, Mia!");
await v.fill("#comment-body", "Oops, typo");
await v.click('button:has-text("Comment")');
await v.waitForSelector("li >> text=Oops, typo");
v.once("dialog", (d) => d.accept());
await v.locator("li", { hasText: "Oops, typo" }).locator('button:has-text("Delete")').click();
await v.waitForFunction(() => !document.body.innerText.includes("Oops, typo"));
await v.screenshot({ path: `${SHOTS}30-comments-mobile.png`, fullPage: true });
step("viewer comments and deletes their own comment");

await a.goto(childUrl);
await a.waitForSelector("article >> text=1 comment");
await a.waitForSelector('button[aria-label="Like"]:has-text("1")');
await a.goto(postUrl);
await a.waitForSelector("li >> text=So proud of you");
await a.screenshot({ path: `${SHOTS}31-post-comments.png`, fullPage: true });
step("owner sees like and comment counts");

// --- Shared pages carry no social UI ---
await a.goto(`${childUrl}/settings`);
await a.selectOption("#maxVisibility", "link");
await a.click('button:has-text("Save changes")');
await a.waitForSelector("text=Saved.");
await a.goto(childUrl);
await a.locator("article").locator('a:has-text("Edit")').click();
await a.selectOption("#visibility", "link");
await a.click('button:has-text("Save changes")');
await a.waitForURL((u) => u.pathname === `/children/${childId}`);
await ctxA.grantPermissions(["clipboard-read", "clipboard-write"]);
await a.locator("article").locator('button:has-text("Share")').click();
await a.waitForSelector("text=Share link copied.");
const shareUrl = await a.evaluate(() => navigator.clipboard.readText());
await anon.goto(shareUrl);
await anon.waitForSelector("text=Mia's first painting");
const sharedText = await anon.locator("main").innerText();
assert(!sharedText.includes("So proud") && !sharedText.includes("comment") && (await anon.locator('button[aria-label="Like"]').count()) === 0,
  "shared page shows no comments or likes");
step("share link shows the post without comments or likes");

// --- Account page: rename, storage, export ---
await a.goto(`${BASE}/account`);
await a.waitForSelector("text=KB of 2 GB used");
await a.fill("#displayName", "Alice C.");
await a.click('button:has-text("Save")');
await a.waitForSelector("text=Saved.");
await a.screenshot({ path: `${SHOTS}32-account.png`, fullPage: true });
step("account page: storage shown, name updated");

const exportRes = await a.request.get(`${BASE}/account/export`);
assert(exportRes.status() === 200 && exportRes.headers()["content-type"] === "application/zip", "export is a zip");
const files = unzipSync(new Uint8Array(await exportRes.body()));
const names = Object.keys(files);
const folder = names.find((n) => n.endsWith("/posts.json")).replace("/posts.json", "");
const account = JSON.parse(strFromU8(files["account.json"]));
const posts = JSON.parse(strFromU8(files[`${folder}/posts.json`]));
assert(names.includes("README.txt"), "README");
assert(account.email === alice.email && account.displayName === "Alice C.", "account.json");
assert(posts.length === 1 && posts[0].comments[0].body.startsWith("So proud") && posts[0].likes === 1, "posts.json has comments + likes");
const photo = names.find((n) => n.startsWith(`${folder}/photos/`) && n.endsWith(".jpg"));
assert(photo && files[photo][0] === 0xff && files[photo][1] === 0xd8, "photo is a real JPEG");
step(`export zip: ${names.length} files incl. account, posts with comments, ${photo}`);

const vExport = unzipSync(new Uint8Array(await (await v.request.get(`${BASE}/account/export`)).body()));
assert(!Object.keys(vExport).some((n) => n.includes("/photos/")), "viewer export has no child folders");
assert(JSON.parse(strFromU8(vExport["account.json"])).commentsYouWrote.length === 1, "viewer export lists their comment");
step("viewer export contains only their own data");

// --- Cleanup cron ---
res = await fetch(`${BASE}/api/cron/cleanup`);
assert(res.status === 401, "cron requires secret");
const { data: postRow } = await admin.from("posts").select("id").eq("child_id", childId).single();
const { data: aliceProfile } = await admin.from("profiles").select("id, storage_used_bytes").eq("display_name", "Alice C.").order("created_at", { ascending: false }).limit(1).single();
await admin.from("media").insert({ post_id: postRow.id, child_id: childId, uploader_id: aliceProfile.id, kind: "image", bytes: 123456, created_at: new Date(Date.now() - 2 * 86400000).toISOString() });
await admin.from("profiles").update({ storage_used_bytes: aliceProfile.storage_used_bytes + 123456 }).eq("id", aliceProfile.id);
res = await fetch(`${BASE}/api/cron/cleanup`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
const summary = await res.json();
assert(res.ok && summary.abandonedUploads >= 1, `cleanup summary ${JSON.stringify(summary)}`);
const { data: after } = await admin.from("profiles").select("storage_used_bytes").eq("id", aliceProfile.id).single();
assert(after.storage_used_bytes === aliceProfile.storage_used_bytes, "abandoned upload's quota refunded");
const { count: readyLeft } = await admin.from("media").select("id", { count: "exact", head: true }).eq("child_id", childId);
assert(readyLeft === 1, "finished photo untouched");
step(`cleanup cron: ${JSON.stringify(summary)}; quota refunded, real photos untouched`);

// --- Delete Alice's account ---
await a.goto(`${BASE}/account`);
await a.waitForSelector("text=You are the only owner of these child profiles");
await a.waitForSelector("li:has-text('Mia')");
await a.fill("#confirm", alice.email);
await a.fill("#delete-password", "wrong-password");
a.once("dialog", (d) => d.accept());
await a.click('button:has-text("Delete my account")');
await a.waitForSelector("text=Incorrect email or password.");
step("wrong password blocks deletion");

const { data: mediaBefore } = await admin.from("media").select("storage_path").eq("child_id", childId);
await a.fill("#confirm", alice.email);
await a.fill("#delete-password", PASSWORD);
a.once("dialog", (d) => d.accept());
await a.click('button:has-text("Delete my account")');
await a.waitForURL(`${BASE}/?accountDeleted=1`);
await a.waitForSelector("text=Your account has been deleted.");
const { count: children } = await admin.from("children").select("id", { count: "exact", head: true }).eq("id", childId);
assert(children === 0, "sole-owned child deleted");
const { data: leftovers } = await admin.storage.from("media").list(childId);
assert(leftovers.length === 0 && mediaBefore.length === 1, "child's photos purged from storage");
const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
assert(!users.users.some((u) => u.email === alice.email), "auth user deleted");
assert(users.users.some((u) => u.email === val.email), "other family member's account intact");
await a.goto(`${BASE}/dashboard`);
assert(a.url().includes("/login"), "signed out after deletion");
await v.goto(`${BASE}/dashboard`);
await v.waitForSelector("text=You haven't added a child yet.");
res = await anon.goto(shareUrl);
assert(res.status() === 404, "share link dead after deletion");
step("account deleted: child, files, auth user gone; Val unaffected; links dead");

// --- Chinese UI on comments/account ---
await v.selectOption('select[aria-label="Language"]', "zh");
await v.waitForSelector("text=你还没有添加孩子。");
await v.goto(`${BASE}/account`);
await v.waitForSelector("h1:has-text('账号')");
await v.screenshot({ path: `${SHOTS}33-account-zh-mobile.png`, fullPage: true });
step("account page in Chinese");

await browser.close();
console.log("ALL OK");

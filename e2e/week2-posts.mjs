// Week 2 end-to-end: posts, photo uploads, metadata stripping, visibility, edit/delete.
import { launch } from "./browser.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const sharp = require("sharp");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SP = new URL("./.output/", import.meta.url).pathname;
const SHOTS = `${SP}shots/`;
const FIX = `${SP}fixtures/`;
const admin = createClient("http://127.0.0.1:54321", process.env.SUPABASE_SECRET_KEY);

const run = Date.now();
const alice = { name: "Alice", email: `alice${run}@example.com` };
const val = { name: "Grandma Val", email: `val${run}@example.com` };
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

// --- Alice creates Mia and invites Val as a viewer ---
const ctxA = await browser.newContext({ viewport: { width: 1200, height: 900 } });
await ctxA.grantPermissions(["clipboard-read", "clipboard-write"]);
const a = await ctxA.newPage();
a.on("pageerror", (e) => console.log("PAGE ERROR (alice):", e.message));
await signup(a, alice);
await a.waitForURL(`${BASE}/dashboard`);
await a.goto(`${BASE}/children/new`);
await a.fill("#nickname", "Mia");
await a.fill("#birthDate", "2020-05-01");
await a.check('input[name="consent"]');
await a.click('button:has-text("Create profile")');
await a.waitForURL(/\/children\/[0-9a-f-]+$/);
const childUrl = a.url();
const childId = childUrl.split("/").pop();
await a.waitForSelector("text=Mia's timeline is empty");
step("empty timeline shown");

await a.goto(`${childUrl}/settings`);
await a.fill("#invite-email", val.email);
await a.click('button:has-text("Create invitation")');
await a.waitForSelector("text=/Invitation (created|emailed)/");
await a.click('button:has-text("Copy link")');
const inviteUrl = await a.evaluate(() => navigator.clipboard.readText());

// --- Empty post is rejected ---
await a.goto(`${childUrl}/posts/new`);
await a.waitForSelector("text=Photos up to 15 MB");
step("video option hidden when Mux isn't configured");
await a.click('button:has-text("Publish")');
await a.waitForSelector("text=Write something or add a photo or video.");
step("empty post is rejected");

// --- Milestone with two photos (one carrying EXIF metadata, one huge PNG) ---
await a.click('[role="radio"]:has-text("Milestone")');
await a.fill("#title", "First steps");
await a.fill("#body", "Mia walked across the living room all by herself!");
await a.fill("#occurredOn", "2021-06-10");
await a.selectOption("#visibility", "family");
await a.setInputFiles('[data-testid="media-input"]', [`${FIX}gps.jpg`, `${FIX}big.png`]);
await a.waitForSelector("li img", { state: "attached" });
await a.screenshot({ path: `${SHOTS}10-composer.png`, fullPage: true });
await a.click('button:has-text("Publish")');
await a.waitForURL((u) => u.pathname === `/children/${childId}`, { timeout: 30000 });
await a.waitForSelector("h3:has-text('First steps')");
await a.waitForSelector("text=1 year, 1 month");
step("milestone with 2 photos published; age at the time shown");

// Verify what landed in storage.
const { data: media } = await admin.from("media").select("*").eq("child_id", childId).order("position");
assert(media.length === 2, `expected 2 media, got ${media.length}`);
assert(media.every((m) => m.status === "ready"), "media should be ready");
for (const m of media) {
  for (const path of [m.storage_path, m.thumb_path]) {
    const { data: blob, error } = await admin.storage.from("media").download(path);
    assert(!error, `download ${path}`);
    const meta = await sharp(Buffer.from(await blob.arrayBuffer())).metadata();
    assert(meta.format === "jpeg", "stored as jpeg");
    assert(!meta.exif && !meta.xmp && !meta.iptc, `${path} must carry no metadata`);
    assert(Math.max(meta.width, meta.height) <= 2560, `${path} resized (${meta.width}x${meta.height})`);
  }
}
const big = media[1];
assert(big.width === 2560 && big.height === 1536, `big png resized to 2560x1536, got ${big.width}x${big.height}`);
const { data: prof } = await admin.from("profiles").select("storage_used_bytes").eq("display_name", "Alice").order("created_at", { ascending: false }).limit(1).single();
const storedBytes = media.reduce((s, m) => s + m.bytes, 0);
assert(prof.storage_used_bytes === storedBytes, `quota ${prof.storage_used_bytes} should equal stored ${storedBytes}`);
step(`storage: JPEG only, metadata stripped, resized, quota = ${storedBytes} bytes`);

// Lightbox
await a.click('button[aria-label="Open photo"] >> nth=0');
await a.waitForSelector('[role="dialog"] img');
await a.waitForSelector("text=1 / 2");
await a.keyboard.press("ArrowRight");
await a.waitForSelector("text=2 / 2");
await a.screenshot({ path: `${SHOTS}11-lightbox.png` });
await a.keyboard.press("Escape");
step("lightbox opens and navigates");

// --- A private, text-only post ---
await a.goto(`${childUrl}/posts/new`);
await a.fill("#body", "Doctor visit — private note for us.");
await a.fill("#occurredOn", "2021-07-02");
await a.selectOption("#visibility", "private");
await a.click('button:has-text("Publish")');
await a.waitForURL((u) => u.pathname === `/children/${childId}`);
await a.waitForSelector("text=Doctor visit");
await a.screenshot({ path: `${SHOTS}12-timeline.png`, fullPage: true });
step("private text post published");

// --- Val (viewer) joins and sees only the family post ---
const ctxV = await browser.newContext({ viewport: { width: 390, height: 844 } });
const v = await ctxV.newPage();
await v.goto(inviteUrl);
await v.click("text=Create an account to accept");
await signup(v, val, new URL(inviteUrl).pathname);
await v.waitForURL(inviteUrl);
await v.click('button:has-text("Accept invitation")');
await v.waitForURL(childUrl);
await v.waitForSelector("h3:has-text('First steps')");
assert((await v.locator("text=Doctor visit").count()) === 0, "viewer must not see private post");
assert((await v.locator("text=+ New post").count()) === 0, "viewer has no New post button");
assert((await v.locator('a:has-text("Edit")').count()) === 0, "viewer has no Edit");
const imgSrc = await v.locator("article img").first().getAttribute("src");
const imgRes = await fetch(imgSrc);
assert(imgRes.ok, "viewer's signed image URL loads");
await v.screenshot({ path: `${SHOTS}13-viewer-mobile.png`, fullPage: true });
step("viewer sees family post + photos, not the private post, no edit controls");

const res = await v.goto(`${childUrl}/posts/new`);
assert(res.status() === 404, "viewer gets 404 on composer");
step("viewer cannot open composer");

// Raw storage path without a signature is rejected.
const raw = await fetch(`http://127.0.0.1:54321/storage/v1/object/public/media/${media[0].storage_path}`);
assert(!raw.ok, "bucket is not public");
step("bucket is private (no public URL access)");

// --- Alice edits: remove one photo, retitle ---
await a.goto(childUrl);
await a.locator("article", { hasText: "First steps" }).locator('a:has-text("Edit")').click();
await a.waitForSelector("h1:has-text('Edit post')");
a.once("dialog", (d) => d.accept());
await a.click('button[aria-label="Remove"] >> nth=1');
await a.waitForFunction(() => document.querySelectorAll('button[aria-label="Remove"]').length === 1);
await a.fill("#title", "First steps!!");
await a.click('button:has-text("Save changes")');
await a.waitForURL((u) => u.pathname === `/children/${childId}`);
await a.waitForSelector("h3:has-text('First steps!!')");
const { data: afterEdit } = await admin.from("media").select("id").eq("child_id", childId);
assert(afterEdit.length === 1, "one photo left after edit");
const { data: gone } = await admin.storage.from("media").list(`${childId}/${big.id}`);
assert(gone.length === 0, "removed photo's files are deleted from storage");
step("edit: photo removed (files purged), title updated");

// --- Chinese UI ---
await a.selectOption('select[aria-label="Language"]', "zh");
await a.waitForSelector("text=里程碑");
await a.screenshot({ path: `${SHOTS}14-timeline-zh.png`, fullPage: true });
step("timeline renders in Chinese");

// --- Alice deletes the milestone post ---
a.once("dialog", (d) => d.accept());
await a.locator("article", { hasText: "First steps!!" }).locator('button:has-text("删除")').click();
await a.waitForFunction(() => !document.body.innerText.includes("First steps!!"));
const { data: left } = await admin.from("media").select("id").eq("child_id", childId);
assert(left.length === 0, "media rows deleted with post");
const { data: files } = await admin.storage.from("media").list(childId);
assert(files.length === 0, `storage folder empty, found ${files.length}`);
const { data: prof2 } = await admin.from("profiles").select("storage_used_bytes").eq("display_name", "Alice").order("created_at", { ascending: false }).limit(1).single();
assert(prof2.storage_used_bytes === 0, `quota refunded, got ${prof2.storage_used_bytes}`);
step("delete post: rows, files and quota all cleaned up");

await browser.close();
console.log("ALL OK");

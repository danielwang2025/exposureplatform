// Mux integration test against a server started with fake Mux credentials.
// Real Mux API calls fail (no account), so we test: the failure path of
// creating an upload, webhook signature checking, and the webhook state machine.
//
// Start the app on :3001 with fake Mux settings first, e.g.:
//   openssl genrsa -traditional -out /tmp/mux.pem 2048
//   MUX_TOKEN_ID=fake MUX_TOKEN_SECRET=fake MUX_WEBHOOK_SECRET=whsec_test \
//   MUX_SIGNING_KEY_ID=testkey MUX_SIGNING_KEY_PRIVATE=$(base64 < /tmp/mux.pem | tr -d '\n') \
//   npx next start -p 3001
// then: set -a; source .env.local; set +a; node e2e/mux-webhook.mjs
import { launch } from "./browser.mjs";
import { createHmac, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const SP = new URL("./.output/", import.meta.url).pathname;
const admin = createClient("http://127.0.0.1:54321", process.env.SUPABASE_SECRET_KEY);
const step = (msg) => console.log("✓", msg);
const assert = (cond, msg) => { if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`); };

function signed(body, secret = "whsec_test") {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return { "content-type": "application/json", "mux-signature": `t=${t},v1=${v1}` };
}
async function hook(event, secret) {
  const body = JSON.stringify({ id: randomUUID(), created_at: new Date().toISOString(), object: { type: "asset", id: "x" }, environment: { name: "test", id: "env" }, ...event });
  return fetch(`${BASE}/api/webhooks/mux`, { method: "POST", headers: signed(body, secret), body });
}

// Fixture: a user with a child, a post, and two pending videos (quota reserved).
const run = Date.now();
const email = `muxtest${run}@example.com`;
const { data: created } = await admin.auth.admin.createUser({ email, password: "correct-horse-1", email_confirm: true, user_metadata: { display_name: "Pat" } });
const userId = created.user.id;
const { data: child } = await admin.from("children").insert({ nickname: "Kai", created_by: userId }).select().single();
await admin.from("child_members").insert({ child_id: child.id, user_id: userId, role: "owner" });
const { data: post } = await admin.from("posts").insert({ child_id: child.id, author_id: userId, body: "Swimming lesson", visibility: "family" }).select().single();
const { data: [ok, long] } = await admin.from("media").insert([
  { post_id: post.id, child_id: child.id, uploader_id: userId, kind: "video", bytes: 5_000_000, mux_upload_id: `up_ok_${run}`, position: 0 },
  { post_id: post.id, child_id: child.id, uploader_id: userId, kind: "video", bytes: 7_000_000, mux_upload_id: `up_long_${run}`, position: 1 },
]).select();
await admin.from("profiles").update({ storage_used_bytes: 12_000_000 }).eq("id", userId);

// 1. Bad signature is rejected.
let res = await hook({ type: "video.upload.asset_created", data: { id: ok.mux_upload_id, asset_id: "as_ok" } }, "wrong-secret");
assert(res.status === 400, `bad signature → 400, got ${res.status}`);
step("webhook rejects a bad signature");

// 2. Upload → asset created.
res = await hook({ type: "video.upload.asset_created", data: { id: ok.mux_upload_id, asset_id: `as_ok_${run}`, status: "asset_created" } });
assert(res.ok, `asset_created → ${res.status}`);
let { data: row } = await admin.from("media").select("*").eq("id", ok.id).single();
assert(row.mux_asset_id === `as_ok_${run}`, "asset id recorded");
step("upload.asset_created links the Mux asset");

// 3. Asset ready (12 s) → media ready with signed playback id.
res = await hook({ type: "video.asset.ready", data: { id: `as_ok_${run}`, status: "ready", duration: 12.4, passthrough: ok.id, upload_id: ok.mux_upload_id, playback_ids: [{ id: `pb_${run}`, policy: "signed" }] } });
assert(res.ok, `asset.ready → ${res.status}`);
({ data: row } = await admin.from("media").select("*").eq("id", ok.id).single());
assert(row.status === "ready" && row.mux_playback_id === `pb_${run}` && Number(row.duration_seconds) === 12.4, `ready row: ${JSON.stringify(row)}`);
step("asset.ready marks the video ready with its signed playback id");

// 4. Too-long asset (400 s) → failed, quota refunded.
res = await hook({ type: "video.asset.ready", data: { id: `as_long_${run}`, status: "ready", duration: 400, passthrough: long.id, playback_ids: [{ id: "pb_long", policy: "signed" }] } });
assert(res.ok, `long asset.ready → ${res.status}`);
({ data: row } = await admin.from("media").select("*").eq("id", long.id).single());
assert(row.status === "failed" && row.error === "too_long" && row.bytes === 0, `long row: ${JSON.stringify(row)}`);
const { data: prof } = await admin.from("profiles").select("storage_used_bytes").eq("id", userId).single();
assert(prof.storage_used_bytes === 5_000_000, `quota after refund: ${prof.storage_used_bytes}`);
step("videos over 5 minutes are rejected and their quota refunded");

// 5. Timeline renders a Mux player with signed tokens, and a failed tile.
const browser = await launch();
const page = await browser.newPage();
await page.goto(`${BASE}/login`);
await page.fill("#email", email);
await page.fill("#password", "correct-horse-1");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/dashboard`);
await page.goto(`${BASE}/children/${child.id}`);
await page.waitForSelector("text=Swimming lesson");
await page.waitForSelector("mux-player", { state: "attached", timeout: 15000 });
await page.waitForFunction(() => document.querySelector("mux-player")?.playbackId);
const attrs = await page.locator("mux-player").evaluate((el) => ({
  playbackId: el.playbackId,
  token: el.tokens?.playback ?? el.playbackToken,
}));
assert(attrs.playbackId === `pb_${run}`, `player playback id ${attrs.playbackId}`);
const [header, payload] = attrs.token.split(".").slice(0, 2).map((p) => JSON.parse(Buffer.from(p, "base64url").toString()));
assert(header.alg === "RS256", `jwt header ${JSON.stringify(header)}`);
assert(payload.kid === "testkey" && payload.sub === `pb_${run}` && payload.aud === "v" && payload.exp > Date.now() / 1000, `jwt payload ${JSON.stringify(payload)}`);
await page.waitForSelector("text=This file couldn't be processed.");
await page.screenshot({ path: `${SP}shots/15-video.png`, fullPage: true });
step("timeline shows a Mux player with a signed RS256 playback token, and a failed tile");

// 6. Starting a real upload with fake credentials fails cleanly (no leftover row, quota intact).
await page.goto(`${BASE}/children/${child.id}/posts/new`);
await page.waitForSelector("text=videos up to 5 min / 1 GB");
await page.fill("#body", "Video attempt");
await page.setInputFiles('[data-testid="media-input"]', { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(200_000, 1) });
await page.click('button:has-text("Publish")');
await page.waitForSelector("text=The post was saved, but some files didn't upload.", { timeout: 20000 });
const { count } = await admin.from("media").select("id", { count: "exact", head: true }).eq("child_id", child.id);
assert(count === 2, `no leftover media row, found ${count}`);
const { data: prof2 } = await admin.from("profiles").select("storage_used_bytes").eq("id", userId).single();
assert(prof2.storage_used_bytes === 5_000_000, `quota unchanged after failed upload: ${prof2.storage_used_bytes}`);
step("failed Mux upload creation leaves no row and no quota charge");

await browser.close();
await admin.auth.admin.deleteUser(userId).catch(() => {});
console.log("ALL OK");

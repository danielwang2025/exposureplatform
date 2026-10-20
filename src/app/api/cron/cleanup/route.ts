import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { purgeMediaFiles } from "@/lib/media-cleanup";
import { createAdminClient } from "@/lib/supabase/admin";

const DAY = 24 * 60 * 60 * 1000;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Daily housekeeping (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`).
export async function GET(request: NextRequest) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const admin = createAdminClient();
  const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

  // 1. Uploads abandoned mid-way: still pending after a day. Deleting the row
  //    refunds the reserved quota; then remove whatever reached storage/Mux.
  const { data: abandoned, error } = await admin
    .from("media")
    .delete()
    .eq("status", "pending")
    .lt("created_at", ago(1))
    .select("storage_path, thumb_path, mux_asset_id, mux_upload_id");
  if (error) {
    console.error("cleanup: media", error);
    return new Response("Cleanup failed", { status: 500 });
  }
  await purgeMediaFiles(abandoned);

  // 2. Invitations that expired over a month ago (they hold someone's email).
  const { count: invitations } = await admin
    .from("invitations")
    .delete({ count: "exact" })
    .is("accepted_at", null)
    .lt("expires_at", ago(30));

  // 3. Share links revoked or expired over 90 days ago.
  const { count: revokedLinks } = await admin.from("share_links").delete({ count: "exact" }).lt("revoked_at", ago(90));
  const { count: expiredLinks } = await admin.from("share_links").delete({ count: "exact" }).lt("expires_at", ago(90));

  // 4. Rate-limit counters: the longest window is a day.
  const { count: rateLimits } = await admin.from("rate_limits").delete({ count: "exact" }).lt("window_start", ago(2));

  const summary = {
    abandonedUploads: abandoned.length,
    invitations: invitations ?? 0,
    shareLinks: (revokedLinks ?? 0) + (expiredLinks ?? 0),
    rateLimits: rateLimits ?? 0,
  };
  console.log("cleanup", summary);
  return Response.json(summary);
}

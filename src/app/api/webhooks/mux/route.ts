import type { NextRequest } from "next/server";
import { getMux, MAX_VIDEO_SECONDS } from "@/lib/mux";
import { createAdminClient } from "@/lib/supabase/admin";

// Mux → us: upload/asset lifecycle events. Every event is signature-checked
// with MUX_WEBHOOK_SECRET before anything is trusted.
export async function POST(request: NextRequest) {
  const mux = getMux();
  if (!mux || !process.env.MUX_WEBHOOK_SECRET) return new Response("Video not configured", { status: 503 });

  const body = await request.text();
  let event;
  try {
    event = await mux.webhooks.unwrap(body, request.headers);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const admin = createAdminClient();

  switch (event.type) {
    case "video.upload.asset_created": {
      const { id: uploadId, asset_id: assetId } = event.data;
      if (assetId) await admin.from("media").update({ mux_asset_id: assetId }).eq("mux_upload_id", uploadId);
      break;
    }

    case "video.asset.ready": {
      const asset = event.data;
      const media = await findMedia(admin, asset.passthrough, asset.upload_id);
      if (!media) break;

      if ((asset.duration ?? 0) > MAX_VIDEO_SECONDS + 5) {
        await admin.rpc("fail_media", { p_media_id: media.id, p_error: "too_long" });
        await mux.video.assets.delete(asset.id).catch((e) => console.error("Mux delete failed", e));
        break;
      }

      const playbackId = asset.playback_ids?.find((p) => p.policy === "signed")?.id;
      await admin.from("media").update({ mux_asset_id: asset.id, mux_playback_id: playbackId ?? null }).eq("id", media.id);
      await admin.rpc("settle_media", {
        p_media_id: media.id,
        p_bytes: media.bytes,
        p_duration: asset.duration,
      });
      break;
    }

    case "video.asset.errored": {
      const media = await findMedia(admin, event.data.passthrough, event.data.upload_id);
      if (media) await admin.rpc("fail_media", { p_media_id: media.id, p_error: "processing_failed" });
      break;
    }

    case "video.upload.errored":
    case "video.upload.cancelled": {
      const { data } = await admin.from("media").select("id, status").eq("mux_upload_id", event.data.id).maybeSingle();
      if (data?.status === "pending") await admin.rpc("fail_media", { p_media_id: data.id, p_error: "upload_failed" });
      break;
    }
  }

  return new Response("ok");
}

async function findMedia(admin: ReturnType<typeof createAdminClient>, passthrough?: string, uploadId?: string) {
  const query = admin.from("media").select("id, bytes");
  const { data } = passthrough
    ? await query.eq("id", passthrough).maybeSingle()
    : uploadId
      ? await query.eq("mux_upload_id", uploadId).maybeSingle()
      : { data: null };
  return data;
}

"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isUuid, visibilities } from "@/lib/data/children";
import { postKinds } from "@/lib/data/posts";
import { fieldErrorsFrom } from "@/lib/forms";
import { purgeMediaFiles } from "@/lib/media-cleanup";
import { canUploadVideo } from "@/lib/data/billing";
import { getMux } from "@/lib/mux";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error?: string; fieldErrors?: Record<string, string>; postId?: string };

function dbErrorKey(error: PostgrestError): string {
  switch (error.hint) {
    case "visibility_exceeds_max":
      return "posts.errors.visibilityTooWide";
    case "quota_exceeded":
      return "posts.errors.quotaExceeded";
    case "file_too_large":
      return "posts.errors.fileTooLarge";
    case "too_many_files":
      return "posts.errors.tooManyFiles";
    case "skill_archived":
      return "skills.errors.archived";
  }
  if (error.code === "42501") return "errors.forbidden";
  // Foreign key: the chosen project doesn't belong to this child.
  if (error.code === "23503") return "errors.forbidden";
  return "errors.generic";
}

const postInput = z.object({
  kind: z.enum(postKinds),
  title: z
    .string()
    .trim()
    .max(120, "validation.titleLength")
    .transform((v) => v || null),
  body: z.string().trim().max(5000, "validation.bodyLength"),
  occurredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "validation.date")
    .refine((v) => v <= new Date().toISOString().slice(0, 10), "validation.dateFuture"),
  visibility: z.enum(visibilities),
  projectId: z
    .string()
    .transform((v) => v || null)
    .refine((v) => v === null || isUuid(v), "errors.forbidden"),
  // skill id -> 1..5; only saved on reviews.
  ratings: z
    .record(z.string().refine(isUuid, "errors.forbidden"), z.int().min(1).max(5))
    .default({}),
});
export type PostInput = z.input<typeof postInput>;

function parsePost(input: PostInput) {
  const parsed = postInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, fieldErrors: fieldErrorsFrom(parsed.error) };
  return { ok: true as const, data: parsed.data };
}

export async function createPost(
  childId: string,
  input: PostInput & { hasMedia: boolean },
): Promise<ActionResult<{ postId: string }>> {
  const user = await requireUser();
  if (!isUuid(childId)) return { ok: false, error: "errors.forbidden" };
  const parsed = parsePost(input);
  if (!parsed.ok) return parsed;
  // Media is uploaded after the post exists, so the client says whether any is coming.
  if (!parsed.data.body && !parsed.data.title && !input.hasMedia) {
    return { ok: false, fieldErrors: { body: "posts.errors.empty" } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .insert({
      child_id: childId,
      author_id: user.id,
      kind: parsed.data.kind,
      title: parsed.data.title,
      body: parsed.data.body,
      occurred_on: parsed.data.occurredOn,
      visibility: parsed.data.visibility,
      project_id: parsed.data.projectId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: dbErrorKey(error) };

  revalidatePath(`/children/${childId}`);
  if (parsed.data.kind === "review") {
    const ratingsError = await saveRatings(supabase, data.id, parsed.data.ratings);
    // The post exists either way; hand back its id so a retry edits it.
    if (ratingsError) return { ok: false, error: ratingsError, postId: data.id };
  }
  return { ok: true, postId: data.id };
}

export async function updatePost(childId: string, postId: string, input: PostInput): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(childId) || !isUuid(postId)) return { ok: false, error: "errors.forbidden" };
  const parsed = parsePost(input);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .update({
      kind: parsed.data.kind,
      title: parsed.data.title,
      body: parsed.data.body,
      occurred_on: parsed.data.occurredOn,
      visibility: parsed.data.visibility,
      project_id: parsed.data.projectId,
    })
    .eq("id", postId)
    .eq("child_id", childId)
    .select("id");
  if (error) return { ok: false, error: dbErrorKey(error) };
  if (data.length === 0) return { ok: false, error: "errors.forbidden" };

  revalidatePath(`/children/${childId}`, "layout");
  // Other kinds lose their ratings in the database (posts_drop_ratings_off_review).
  if (parsed.data.kind === "review") {
    const ratingsError = await saveRatings(supabase, postId, parsed.data.ratings);
    if (ratingsError) return { ok: false, error: ratingsError };
  }
  return { ok: true };
}

async function saveRatings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postId: string,
  ratings: Record<string, number>,
): Promise<string | undefined> {
  const { error } = await supabase.rpc("set_post_ratings", { p_post_id: postId, p_ratings: ratings });
  return error ? dbErrorKey(error) : undefined;
}

export async function deletePost(childId: string, postId: string): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(childId) || !isUuid(postId)) return { ok: false, error: "errors.forbidden" };

  const supabase = await createClient();
  const { data: media } = await supabase
    .from("media")
    .select("storage_path, thumb_path, mux_asset_id, mux_upload_id")
    .eq("post_id", postId);
  const { data, error } = await supabase.from("posts").delete().eq("id", postId).eq("child_id", childId).select("id");
  if (error) return { ok: false, error: dbErrorKey(error) };
  if (data.length === 0) return { ok: false, error: "errors.forbidden" };

  await purgeMediaFiles(media ?? []);
  revalidatePath(`/children/${childId}`, "layout");
  return { ok: true };
}

export async function deleteMedia(childId: string, mediaId: string): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(childId) || !isUuid(mediaId)) return { ok: false, error: "errors.forbidden" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("media")
    .delete()
    .eq("id", mediaId)
    .eq("child_id", childId)
    .select("storage_path, thumb_path, mux_asset_id, mux_upload_id");
  if (error) return { ok: false, error: dbErrorKey(error) };
  if (data.length === 0) return { ok: false, error: "errors.forbidden" };

  await purgeMediaFiles(data);
  revalidatePath(`/children/${childId}`, "layout");
  return { ok: true };
}

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export type ImageUploadTicket = {
  mediaId: string;
  full: { path: string; token: string };
  thumb: { path: string; token: string };
};

// Step 1 for a photo: reserve quota, then hand out one-time upload URLs.
// Uploads never finished are purged by the daily /api/cron/cleanup job.
export async function startImageUpload(
  postId: string,
  sizes: { full: number; thumb: number },
): Promise<ActionResult<{ ticket: ImageUploadTicket }>> {
  await requireUser();
  if (!isUuid(postId)) return { ok: false, error: "errors.forbidden" };
  if (sizes.full <= 0 || sizes.thumb <= 0 || sizes.full > MAX_IMAGE_BYTES || sizes.thumb > MAX_IMAGE_BYTES) {
    return { ok: false, error: "posts.errors.fileTooLarge" };
  }

  const supabase = await createClient();
  const { data: media, error } = await supabase.rpc("create_media", {
    p_post_id: postId,
    p_kind: "image",
    p_bytes: sizes.full + sizes.thumb,
  });
  if (error) return { ok: false, error: dbErrorKey(error) };

  const admin = createAdminClient();
  const bucket = admin.storage.from("media");
  const [full, thumb] = await Promise.all([
    bucket.createSignedUploadUrl(media.storage_path!),
    bucket.createSignedUploadUrl(media.thumb_path!),
  ]);
  if (full.error || thumb.error) {
    await discardMedia(media.id);
    return { ok: false, error: "errors.generic" };
  }

  return {
    ok: true,
    ticket: {
      mediaId: media.id,
      full: { path: full.data.path, token: full.data.token },
      thumb: { path: thumb.data.path, token: thumb.data.token },
    },
  };
}

// Step 2 for a photo: verify what was uploaded, guarantee it carries no
// metadata (GPS, device info), and settle the real size against the quota.
export async function finishImageUpload(childId: string, mediaId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!isUuid(childId) || !isUuid(mediaId)) return { ok: false, error: "errors.forbidden" };

  const supabase = await createClient();
  const { data: media } = await supabase
    .from("media")
    .select("id, uploader_id, status, storage_path, thumb_path")
    .eq("id", mediaId)
    .maybeSingle();
  if (!media || media.uploader_id !== user.id || media.status !== "pending") {
    return { ok: false, error: "errors.forbidden" };
  }

  const admin = createAdminClient();
  const bucket = admin.storage.from("media");
  try {
    let totalBytes = 0;
    let dims: { width?: number; height?: number } = {};
    for (const path of [media.storage_path!, media.thumb_path!]) {
      const { data: blob, error } = await bucket.download(path);
      if (error) throw new Error(`missing upload ${path}`);
      const input = Buffer.from(await blob.arrayBuffer());
      const meta = await sharp(input).metadata();
      if (meta.format !== "jpeg") throw new Error("not a jpeg");

      let output = input;
      if (meta.exif || meta.xmp || meta.iptc) {
        // The browser normally strips metadata; this is the server-side guarantee.
        output = await sharp(input).rotate().jpeg({ quality: 85, mozjpeg: true }).toBuffer();
        const { error: uploadError } = await bucket.upload(path, output, { contentType: "image/jpeg", upsert: true });
        if (uploadError) throw uploadError;
      }
      totalBytes += output.byteLength;
      if (path === media.storage_path) dims = { width: meta.width, height: meta.height };
    }

    const { error } = await admin.rpc("settle_media", {
      p_media_id: mediaId,
      p_bytes: totalBytes,
      p_width: dims.width,
      p_height: dims.height,
    });
    if (error) throw error;
  } catch (error) {
    console.error("finishImageUpload failed", error);
    await discardMedia(mediaId);
    return { ok: false, error: "posts.errors.uploadFailed" };
  }

  revalidatePath(`/children/${childId}`, "layout");
  return { ok: true };
}

// An upload that failed before reaching storage/Mux is removed outright (the
// user still has the file and can retry); deleting the row refunds its quota.
async function discardMedia(mediaId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("media")
    .delete()
    .eq("id", mediaId)
    .select("storage_path, thumb_path, mux_asset_id, mux_upload_id");
  await purgeMediaFiles(data ?? []);
}

const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;

// For a video: reserve quota and create a Mux direct upload. Mux reports back
// through the webhook (src/app/api/webhooks/mux/route.ts).
export async function startVideoUpload(postId: string, bytes: number): Promise<ActionResult<{ mediaId: string; url: string }>> {
  const user = await requireUser();
  const mux = getMux();
  if (!mux || !(await canUploadVideo(user.id))) return { ok: false, error: "posts.errors.videoDisabled" };
  if (!isUuid(postId)) return { ok: false, error: "errors.forbidden" };
  if (bytes <= 0 || bytes > MAX_VIDEO_BYTES) return { ok: false, error: "posts.errors.fileTooLarge" };

  const supabase = await createClient();
  const { data: media, error } = await supabase.rpc("create_media", {
    p_post_id: postId,
    p_kind: "video",
    p_bytes: bytes,
  });
  if (error) return { ok: false, error: dbErrorKey(error) };

  const admin = createAdminClient();
  try {
    const h = await headers();
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? h.get("origin") ?? "*";
    const upload = await mux.video.uploads.create({
      cors_origin: origin,
      new_asset_settings: {
        playback_policies: ["signed"],
        passthrough: media.id,
        video_quality: "basic",
        max_resolution_tier: "1080p",
      },
    });
    if (!upload.url) throw new Error("Mux upload has no URL");
    await admin.from("media").update({ mux_upload_id: upload.id }).eq("id", media.id);
    return { ok: true, mediaId: media.id, url: upload.url };
  } catch (error) {
    console.error("Mux upload creation failed", error);
    await discardMedia(media.id);
    return { ok: false, error: "posts.errors.uploadFailed" };
  }
}

// Called by the browser if a video upload fails or is cancelled mid-way.
export async function abandonUpload(childId: string, mediaId: string): Promise<ActionResult> {
  return deleteMedia(childId, mediaId);
}

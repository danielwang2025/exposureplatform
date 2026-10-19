import * as UpChunk from "@mux/upchunk";
import { createClient } from "@/lib/supabase/client";
import {
  abandonUpload,
  finishImageUpload,
  startImageUpload,
  startVideoUpload,
} from "@/app/(app)/children/post-actions";
import { processImage, UnsupportedImageError, videoDuration } from "./process-image";

export const MAX_VIDEO_SECONDS = 5 * 60;
export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;

export type UploadProgress = (fraction: number) => void;

// Throws an Error whose message is a translation key.
export async function uploadImage(childId: string, postId: string, file: File, onProgress: UploadProgress) {
  onProgress(0.05);
  let processed;
  try {
    processed = await processImage(file);
  } catch (error) {
    throw new Error(error instanceof UnsupportedImageError ? "posts.errors.unsupportedImage" : "posts.errors.uploadFailed");
  }
  onProgress(0.25);

  const start = await startImageUpload(postId, { full: processed.full.size, thumb: processed.thumb.size });
  if (!start.ok) throw new Error(start.error ?? "errors.generic");
  const { ticket } = start;

  const bucket = createClient().storage.from("media");
  const [full, thumb] = await Promise.all([
    bucket.uploadToSignedUrl(ticket.full.path, ticket.full.token, processed.full, { contentType: "image/jpeg" }),
    bucket.uploadToSignedUrl(ticket.thumb.path, ticket.thumb.token, processed.thumb, { contentType: "image/jpeg" }),
  ]);
  if (full.error || thumb.error) {
    await abandonUpload(childId, ticket.mediaId);
    throw new Error("posts.errors.uploadFailed");
  }
  onProgress(0.85);

  const finished = await finishImageUpload(childId, ticket.mediaId);
  if (!finished.ok) throw new Error(finished.error ?? "posts.errors.uploadFailed");
  onProgress(1);
}

export async function checkVideo(file: File): Promise<string | null> {
  if (file.size > MAX_VIDEO_BYTES) return "posts.errors.videoTooLarge";
  try {
    if ((await videoDuration(file)) > MAX_VIDEO_SECONDS + 1) return "posts.errors.videoTooLong";
  } catch {
    // Some formats can't be probed in every browser; Mux still checks duration.
  }
  return null;
}

export async function uploadVideo(childId: string, postId: string, file: File, onProgress: UploadProgress) {
  const problem = await checkVideo(file);
  if (problem) throw new Error(problem);

  const start = await startVideoUpload(postId, file.size);
  if (!start.ok) throw new Error(start.error ?? "errors.generic");

  await new Promise<void>((resolve, reject) => {
    const upload = UpChunk.createUpload({ endpoint: start.url, file, chunkSize: 8192 });
    upload.on("progress", (event) => onProgress(Math.min(0.99, event.detail / 100)));
    upload.on("success", () => resolve());
    upload.on("error", () => reject(new Error("posts.errors.uploadFailed")));
  }).catch(async (error) => {
    await abandonUpload(childId, start.mediaId);
    throw error;
  });
  onProgress(1);
}

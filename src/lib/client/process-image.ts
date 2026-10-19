// Re-encode a photo in the browser before upload. Drawing to a canvas and
// exporting JPEG drops all metadata (GPS location, camera, timestamps),
// applies the EXIF orientation, and shrinks phone photos to a sensible size.

const FULL_EDGE = 2560;
const THUMB_EDGE = 640;

export type ProcessedImage = {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
};

export class UnsupportedImageError extends Error {}

export async function processImage(file: File): Promise<ProcessedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // e.g. HEIC in browsers that can't decode it.
    throw new UnsupportedImageError(file.name);
  }
  try {
    const full = await encode(bitmap, FULL_EDGE, 0.85);
    const thumb = await encode(bitmap, THUMB_EDGE, 0.8);
    return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height };
  } finally {
    bitmap.close();
  }
}

async function encode(bitmap: ImageBitmap, maxEdge: number, quality: number) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  // JPEG has no alpha: paint transparent PNGs onto white instead of black.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Could not encode image");
  return { blob, width, height };
}

export function videoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unreadable video"));
    };
    video.src = url;
  });
}

"use client";

import { useCallback, useEffect, useState } from "react";
import MuxPlayer from "@mux/mux-player-react/lazy";
import { useTranslations } from "next-intl";
import { cn } from "@/components/ui";
import type { TimelineMedia } from "@/lib/data/posts";

export function MediaGallery({ media }: { media: TimelineMedia[] }) {
  const t = useTranslations("posts");
  const [open, setOpen] = useState<number | null>(null);
  const images = media.filter((m) => m.kind === "image" && m.status === "ready" && m.fullUrl);

  if (media.length === 0) return null;
  const single = media.length === 1;

  return (
    <>
      <ul className={cn("grid gap-1.5", single ? "grid-cols-1" : media.length === 2 || media.length === 4 ? "grid-cols-2" : "grid-cols-3")}>
        {media.map((item) => (
          <li
            key={item.id}
            className={cn(
              "relative overflow-hidden rounded-lg bg-background",
              single ? "max-h-[32rem]" : "aspect-square",
            )}
          >
            {item.kind === "video" ? (
              <VideoTile item={item} />
            ) : item.status === "ready" && item.thumbUrl ? (
              <button
                type="button"
                className="block size-full"
                aria-label={t("openPhoto")}
                onClick={() => setOpen(images.findIndex((i) => i.id === item.id))}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={single ? item.fullUrl : item.thumbUrl}
                  alt=""
                  loading="lazy"
                  width={item.width ?? undefined}
                  height={item.height ?? undefined}
                  className={cn("size-full", single ? "max-h-[32rem] object-contain" : "object-cover")}
                />
              </button>
            ) : (
              <StatusTile status={item.status} />
            )}
          </li>
        ))}
      </ul>
      {open !== null && images[open] && (
        <Lightbox images={images} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

function VideoTile({ item }: { item: TimelineMedia }) {
  if (item.status !== "ready" || !item.playbackId) return <StatusTile status={item.status} video />;
  return (
    <MuxPlayer
      playbackId={item.playbackId}
      tokens={item.tokens}
      streamType="on-demand"
      accentColor="#2f855a"
      className="size-full"
      style={{ aspectRatio: "16 / 9", height: "100%" }}
    />
  );
}

function StatusTile({ status, video }: { status: TimelineMedia["status"]; video?: boolean }) {
  const t = useTranslations("posts");
  return (
    <div className="flex size-full min-h-32 flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted">
      <span aria-hidden className="text-2xl">{status === "failed" ? "⚠️" : video ? "🎬" : "⏳"}</span>
      {status === "failed" ? t("mediaFailed") : video ? t("videoProcessing") : t("mediaProcessing")}
    </div>
  );
}

function Lightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: TimelineMedia[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations("posts");
  const prev = useCallback(() => onIndex((index - 1 + images.length) % images.length), [index, images.length, onIndex]);
  const next = useCallback(() => onIndex((index + 1) % images.length), [index, images.length, onIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, prev, next]);

  const image = images[index];
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.fullUrl} alt="" className="max-h-[92vh] max-w-[96vw] object-contain" onClick={(e) => e.stopPropagation()} />
      <button type="button" aria-label={t("close")} onClick={onClose} className="absolute right-4 top-4 text-3xl text-white/80 hover:text-white">
        ✕
      </button>
      {images.length > 1 && (
        <>
          <button
            type="button"
            aria-label={t("previous")}
            onClick={(e) => (e.stopPropagation(), prev())}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 px-3 py-2 text-2xl text-white"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label={t("next")}
            onClick={(e) => (e.stopPropagation(), next())}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 px-3 py-2 text-2xl text-white"
          >
            ›
          </button>
          <p className="absolute bottom-4 text-sm text-white/80">
            {index + 1} / {images.length}
          </p>
        </>
      )}
    </div>
  );
}

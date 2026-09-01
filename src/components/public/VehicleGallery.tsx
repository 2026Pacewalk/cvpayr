"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, X, Expand, Play } from "lucide-react";
import { VehicleImage } from "@/components/VehicleImage";
import { OverlayBadge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { BadgeTone } from "@/lib/constants";

type Media = { id: string; url: string; kind: string; caption: string | null };

export function VehicleGallery({
  media,
  title,
  status,
}: {
  media: Media[];
  title: string;
  status?: { label: string; tone: BadgeTone } | null;
}) {
  const photos = media.filter((m) => m.kind === "photo");
  const videos = media.filter((m) => m.kind === "youtube" || m.kind === "video");
  const [index, setIndex] = React.useState(0);
  const [lightbox, setLightbox] = React.useState(false);
  const [showVideo, setShowVideo] = React.useState(false);
  const touchStart = React.useRef<number | null>(null);

  const count = photos.length;
  const go = React.useCallback(
    (dir: number) => setIndex((i) => (count ? (i + dir + count) % count : 0)),
    [count],
  );

  React.useEffect(() => {
    if (!lightbox) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(false);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [lightbox, go]);

  const current = photos[index];

  return (
    <div>
      {/* Main stage */}
      <div
        className="relative aspect-[4/3] overflow-hidden rounded-[14px] bg-ink-100 sm:aspect-[16/10]"
        onTouchStart={(e) => (touchStart.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchStart.current == null) return;
          const delta = e.changedTouches[0].clientX - touchStart.current;
          if (Math.abs(delta) > 45) go(delta < 0 ? 1 : -1);
          touchStart.current = null;
        }}
      >
        {showVideo && videos[0] ? (
          <iframe
            src={videos[0].url}
            title={`${title} video`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
            allowFullScreen
            className="size-full"
          />
        ) : (
          <>
            <VehicleImage
              src={current?.url}
              alt={`${title} — photo ${index + 1} of ${count}`}
              priority
              className="size-full"
            />

            {status && (
              <div className="absolute top-3 left-3">
                <OverlayBadge tone={status.tone}>{status.label}</OverlayBadge>
              </div>
            )}

            {count > 1 && (
              <>
                <button
                  onClick={() => go(-1)}
                  aria-label="Previous photo"
                  className="absolute top-1/2 left-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-ink-700 shadow-sm backdrop-blur transition-colors hover:bg-white sm:size-10"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  onClick={() => go(1)}
                  aria-label="Next photo"
                  className="absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-ink-700 shadow-sm backdrop-blur transition-colors hover:bg-white sm:size-10"
                >
                  <ChevronRight className="size-5" />
                </button>
              </>
            )}

            <button
              onClick={() => setLightbox(true)}
              aria-label="View full screen"
              className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full bg-ink-950/70 px-3 py-1.5 text-[12px] font-medium text-white backdrop-blur-sm hover:bg-ink-950/85"
            >
              <Expand className="size-3.5" />
              {index + 1} / {count}
            </button>
          </>
        )}
      </div>

      {/* Thumbnails */}
      <div className="hide-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
        {videos.length > 0 && (
          <button
            onClick={() => setShowVideo(true)}
            className={cn(
              "relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border-2 bg-ink-900 text-white transition-colors sm:size-20",
              showVideo ? "border-brand-600" : "border-transparent",
            )}
            aria-label="Play walkaround video"
          >
            <Play className="size-5 fill-current" />
          </button>
        )}
        {photos.map((p, i) => (
          <button
            key={p.id}
            onClick={() => {
              setIndex(i);
              setShowVideo(false);
            }}
            aria-label={`View photo ${i + 1}`}
            aria-current={!showVideo && i === index}
            className={cn(
              "relative size-16 shrink-0 overflow-hidden rounded-[10px] border-2 transition-colors sm:size-20",
              !showVideo && i === index ? "border-brand-600" : "border-transparent opacity-70 hover:opacity-100",
            )}
          >
            <VehicleImage src={p.url} alt="" className="size-full" />
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-ink-950/95 backdrop-blur-sm">
          <div className="flex items-center justify-between p-4 text-white">
            <span className="text-[13px] tabular-nums">
              {index + 1} / {count}
            </span>
            <button
              onClick={() => setLightbox(false)}
              aria-label="Close"
              className="flex size-10 items-center justify-center rounded-full hover:bg-white/10"
            >
              <X className="size-5" />
            </button>
          </div>
          <div
            className="relative flex flex-1 items-center justify-center p-4"
            onTouchStart={(e) => (touchStart.current = e.touches[0].clientX)}
            onTouchEnd={(e) => {
              if (touchStart.current == null) return;
              const delta = e.changedTouches[0].clientX - touchStart.current;
              if (Math.abs(delta) > 45) go(delta < 0 ? 1 : -1);
              touchStart.current = null;
            }}
          >
            <VehicleImage
              src={current?.url}
              alt={`${title} — photo ${index + 1}`}
              className="max-h-full max-w-full rounded-[12px] object-contain"
            />
            {count > 1 && (
              <>
                <button
                  onClick={() => go(-1)}
                  aria-label="Previous"
                  className="absolute left-3 flex size-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                >
                  <ChevronLeft className="size-6" />
                </button>
                <button
                  onClick={() => go(1)}
                  aria-label="Next"
                  className="absolute right-3 flex size-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                >
                  <ChevronRight className="size-6" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import { Upload, X, Star, GripVertical, Loader2, ImagePlus, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { VehicleImage } from "@/components/VehicleImage";

/**
 * Photo manager for the vehicle form.
 * - multi-file upload with progress
 * - drag to reorder (pointer and touch friendly)
 * - explicit cover selection
 * - paste-a-URL escape hatch for stock photography
 * State is mirrored into hidden inputs so the enclosing <form> posts it without JS glue.
 */
export function ImageUploader({
  name = "imageUrls",
  initialUrls = [],
  initialCoverIndex = 0,
  maxImages = 30,
}: {
  name?: string;
  initialUrls?: string[];
  initialCoverIndex?: number;
  maxImages?: number;
}) {
  const [urls, setUrls] = React.useState<string[]>(initialUrls);
  const [cover, setCover] = React.useState(initialCoverIndex);
  const [uploading, setUploading] = React.useState(false);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [overIndex, setOverIndex] = React.useState<number | null>(null);
  const [showUrlInput, setShowUrlInput] = React.useState(false);
  const [urlValue, setUrlValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const toast = useToast();

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    if (urls.length + list.length > maxImages) {
      toast.warning(`Up to ${maxImages} photos`, "Remove a few before adding more.");
      return;
    }

    setUploading(true);
    const body = new FormData();
    list.forEach((f) => body.append("files", f));

    try {
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      setUrls((prev) => [...prev, ...json.urls]);
      toast.success(`${json.urls.length} photo${json.urls.length === 1 ? "" : "s"} added`);
    } catch (e) {
      toast.error("Upload failed", e instanceof Error ? e.message : undefined);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = (i: number) => {
    setUrls((prev) => prev.filter((_, idx) => idx !== i));
    setCover((c) => (i === c ? 0 : i < c ? c - 1 : c));
  };

  const move = (from: number, to: number) => {
    if (from === to) return;
    setUrls((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setCover((c) => {
      if (c === from) return to;
      if (from < c && to >= c) return c - 1;
      if (from > c && to <= c) return c + 1;
      return c;
    });
  };

  const addUrl = () => {
    const value = urlValue.trim();
    if (!value) return;
    if (!/^https?:\/\//i.test(value)) {
      toast.error("Enter a full image URL starting with https://");
      return;
    }
    setUrls((prev) => [...prev, value]);
    setUrlValue("");
    setShowUrlInput(false);
  };

  return (
    <div>
      {/* Hidden inputs carry the state into the form submission */}
      {urls.map((url, i) => (
        <input key={`${url}-${i}`} type="hidden" name={name} value={url} />
      ))}
      <input type="hidden" name="coverIndex" value={cover} />

      <div
        onDragOver={(e) => {
          if (dragIndex === null) e.preventDefault();
        }}
        onDrop={(e) => {
          if (dragIndex !== null) return;
          e.preventDefault();
          if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
        }}
        className="rounded-[12px] border-2 border-dashed border-ink-200 bg-ink-50/60 p-4 transition-colors hover:border-ink-300"
      >
        {urls.length === 0 ? (
          <div className="py-8 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-white text-ink-400 shadow-xs">
              <ImagePlus className="size-5" />
            </span>
            <p className="mt-4 text-[14px] font-medium text-ink-800">Add vehicle photos</p>
            <p className="mx-auto mt-1 max-w-xs text-[12.5px] leading-relaxed text-ink-500">
              Drag files here or tap to browse. The first photo becomes the cover — shoot the
              front three-quarter view first.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-ink-900 px-4 text-[13px] font-medium text-white hover:bg-ink-800 disabled:opacity-60"
              >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {uploading ? "Uploading…" : "Choose photos"}
              </button>
              <button
                type="button"
                onClick={() => setShowUrlInput((s) => !s)}
                className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-ink-200 bg-white px-4 text-[13px] font-medium text-ink-700 hover:bg-ink-50"
              >
                <Link2 className="size-4" />
                Paste URL
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
              {urls.map((url, i) => (
                <div
                  key={`${url}-${i}`}
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragEnter={() => setOverIndex(i)}
                  onDragEnd={() => {
                    if (dragIndex !== null && overIndex !== null) move(dragIndex, overIndex);
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  className={cn(
                    "group relative aspect-[4/3] overflow-hidden rounded-[9px] border-2 bg-white",
                    i === cover ? "border-brand-600" : "border-transparent",
                    dragIndex === i && "opacity-40",
                    overIndex === i && dragIndex !== i && "ring-2 ring-brand-400",
                  )}
                >
                  <VehicleImage src={url} alt={`Photo ${i + 1}`} className="size-full" />

                  {i === cover && (
                    <span className="absolute top-1.5 left-1.5 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                      Cover
                    </span>
                  )}

                  <span className="absolute top-1.5 left-1.5 cursor-grab text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {i !== cover && <GripVertical className="size-4 drop-shadow" />}
                  </span>

                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-ink-950/80 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={() => setCover(i)}
                      aria-label="Set as cover photo"
                      title="Set as cover"
                      className={cn(
                        "flex size-7 items-center justify-center rounded-full bg-white/90 text-ink-600 hover:text-brand-600",
                        i === cover && "text-brand-600",
                      )}
                    >
                      <Star className={cn("size-3.5", i === cover && "fill-current")} />
                    </button>
                    <div className="flex gap-1">
                      {i > 0 && (
                        <button
                          type="button"
                          onClick={() => move(i, i - 1)}
                          aria-label="Move left"
                          className="flex size-7 items-center justify-center rounded-full bg-white/90 text-[13px] font-semibold text-ink-600 hover:text-ink-900"
                        >
                          ‹
                        </button>
                      )}
                      {i < urls.length - 1 && (
                        <button
                          type="button"
                          onClick={() => move(i, i + 1)}
                          aria-label="Move right"
                          className="flex size-7 items-center justify-center rounded-full bg-white/90 text-[13px] font-semibold text-ink-600 hover:text-ink-900"
                        >
                          ›
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => remove(i)}
                        aria-label="Remove photo"
                        className="flex size-7 items-center justify-center rounded-full bg-white/90 text-ink-600 hover:text-danger-600"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading || urls.length >= maxImages}
                className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-[9px] border-2 border-dashed border-ink-300 bg-white text-ink-400 transition-colors hover:border-brand-400 hover:text-brand-600 disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <>
                    <Upload className="size-5" />
                    <span className="text-[11px] font-medium">Add</span>
                  </>
                )}
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] text-ink-500">
                {urls.length} of {maxImages} photos · drag to reorder · star to set the cover
              </p>
              <button
                type="button"
                onClick={() => setShowUrlInput((s) => !s)}
                className="text-[12.5px] font-medium text-brand-700 hover:underline"
              >
                Paste an image URL
              </button>
            </div>
          </>
        )}

        {showUrlInput && (
          <div className="mt-3 flex gap-2">
            <input
              type="url"
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addUrl();
                }
              }}
              placeholder="https://…"
              className="h-10 flex-1 rounded-[10px] border border-ink-200 bg-white px-3 text-[13px] focus:border-brand-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={addUrl}
              className="h-10 rounded-[10px] bg-ink-900 px-4 text-[13px] font-medium text-white"
            >
              Add
            </button>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          className="sr-only"
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
      </div>
    </div>
  );
}

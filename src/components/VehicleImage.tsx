"use client";

import * as React from "react";
import { Car } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Vehicle photo with a graceful fallback.
 * Remote photography can fail (offline, expired CDN link); rather than showing a
 * broken image we render a calm branded placeholder so cards keep their shape.
 */
export function VehicleImage({
  src,
  alt,
  className,
  sizes,
  priority,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = React.useState(false);

  if (!src || failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-gradient-to-br from-ink-100 to-ink-200",
          className,
        )}
        aria-label={alt}
        role="img"
      >
        <Car className="size-8 text-ink-300" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      sizes={sizes}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
      className={cn("object-cover", className)}
    />
  );
}

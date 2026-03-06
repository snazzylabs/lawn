"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface CommentDrawingThumbnailProps {
  src: string;
  alt?: string;
  className?: string;
  imageClassName?: string;
}

export function CommentDrawingThumbnail({
  src,
  alt = "Drawing annotation",
  className,
  imageClassName,
}: CommentDrawingThumbnailProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group mt-2 block overflow-hidden border-2 border-[#1a1a1a] bg-[#e8e8e0] p-1 text-left hover:bg-[#deded6]",
          className,
        )}
        title="Open annotation"
      >
        <img
          src={src}
          alt={alt}
          className={cn("max-h-36 w-auto object-contain", imageClassName)}
        />
      </button>

      {open && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setOpen(false);
            }
          }}
          className="fixed inset-0 z-[120] flex cursor-zoom-out items-center justify-center bg-black/85 p-4"
          aria-label="Close annotation preview"
        >
          <img
            src={src}
            alt={alt}
            className="max-h-[92vh] max-w-[92vw] border-2 border-[#f0f0e8] bg-black/40 shadow-2xl"
          />
          <p className="pointer-events-none absolute bottom-4 text-xs font-mono text-white/80">
            Click anywhere to close
          </p>
        </div>
      )}
    </>
  );
}

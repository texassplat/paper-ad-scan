"use client";

import { useState } from "react";

interface PageViewerProps {
  imageUrl: string | null;
  pageNum: number;
  section: string;
}

export default function PageViewer({
  imageUrl,
  pageNum,
  section,
}: PageViewerProps) {
  const [zoomed, setZoomed] = useState(false);

  if (!imageUrl) {
    return (
      <div className="aspect-[3/4] bg-gray-100 rounded flex items-center justify-center text-gray-400">
        No image available
      </div>
    );
  }

  return (
    <>
      <div
        className="cursor-zoom-in rounded overflow-hidden border border-gray-200"
        onClick={() => setZoomed(true)}
      >
        <img
          src={imageUrl}
          alt={`Page ${pageNum} - ${section}`}
          className="w-full"
        />
      </div>

      {/* Zoom modal */}
      {zoomed && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setZoomed(false)}
        >
          <img
            src={imageUrl}
            alt={`Page ${pageNum} - ${section}`}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}
    </>
  );
}

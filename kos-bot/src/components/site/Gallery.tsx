"use client";

import { useState } from "react";

export type GalleryPhoto = { key: string; alt: string };

/** Cover photo with a thumbnail row that swaps it. Shows a quiet placeholder until photos are uploaded. */
export default function Gallery({ photos, status, label }: { photos: GalleryPhoto[]; status: string; label: string }) {
  const [at, setAt] = useState(0);
  const shown = photos[at];
  return (
    <div>
      <div className="cover">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/${shown.key}`} alt={shown.alt} />
        ) : (
          <div className="cover-empty" role="img" aria-label={`${label}, foto segera hadir`}>Foto segera hadir</div>
        )}
        <span className="status">{status}</span>
      </div>
      {photos.length > 1 && (
        <div className="thumbs">
          {photos.map((p, i) => (
            <button
              key={p.key}
              type="button"
              className={i === at ? "on" : ""}
              aria-label={`Lihat foto ${i + 1} dari ${photos.length}`}
              aria-pressed={i === at}
              onClick={() => setAt(i)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/${p.key}`} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

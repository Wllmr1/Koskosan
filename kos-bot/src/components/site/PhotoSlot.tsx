import type { Photo } from "@prisma/client";
import { photoUrl } from "@/lib/photos";
import { fillSlots } from "@/lib/site";

type Shown = Pick<Photo, "id" | "key" | "caption" | "width" | "height">;

/** One photo tile, or a placeholder until the owner uploads one in the dashboard. */
export function PhotoSlot({ photo, alt, ratio = "4 / 3" }: { photo: Shown | null; alt: string; ratio?: string }) {
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl(photo.key)}
        alt={photo.caption || alt}
        width={photo.width}
        height={photo.height}
        loading="lazy"
        className="photo-tile"
        style={{ aspectRatio: ratio }}
      />
    );
  }
  return (
    <div className="photo-slot" role="img" aria-label={`${alt} — foto segera hadir`} style={{ aspectRatio: ratio }}>
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <circle cx="9" cy="10" r="1.8" />
        <path d="M21 16l-5-5-8 8" />
      </svg>
      <span>Foto segera hadir</span>
    </div>
  );
}

/** A grid of photos padded with placeholders up to `slots` tiles. */
export function PhotoGrid({ photos, slots, alt, min = 220 }: { photos: Shown[]; slots: number; alt: string; min?: number }) {
  return (
    <div className="photo-grid" style={{ gridTemplateColumns: `repeat(auto-fit,minmax(min(${min}px,100%),1fr))` }}>
      {fillSlots(photos, slots).map((photo, i) => (
        <figure key={photo?.id ?? `slot-${i}`} style={{ margin: 0 }}>
          <PhotoSlot photo={photo} alt={alt} />
          {photo?.caption && <figcaption className="small muted" style={{ marginTop: 4 }}>{photo.caption}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

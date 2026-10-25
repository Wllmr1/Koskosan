import { niceDate, rp } from "@/lib/money";
import { availabilityLabel, notBeforeToday, tagsOf, type TypeCard } from "@/lib/room-types";
import Gallery from "./Gallery";

function colorFor(t: TypeCard) {
  return t.availability.free > 0 ? "var(--ok)" : "var(--warn)";
}

/** Cover + thumbnails for a type. Photo alt text names the type, never a room. */
export function TypeGallery({ type }: { type: TypeCard }) {
  const photos = type.photos.map((p) => ({ key: p.key, alt: p.caption || `Kamar ${type.name}` }));
  return <Gallery photos={photos} status={type.availability.free > 0 ? "Tersedia" : "Penuh"} label={`Kamar ${type.name}`} />;
}

/** Tags, description and the four specs, shared by the list block and the type page. */
export function TypeFacts({ type }: { type: TypeCard }) {
  return (
    <>
      <span className="tag">{tagsOf(type).join(" · ")}</span>
      {type.description && <p style={{ whiteSpace: "pre-line" }}>{type.description}</p>}
      <dl className="specs">
        <div><dt>Ketersediaan</dt><dd style={{ color: colorFor(type) }}>{availabilityLabel(type.availability)}</dd></div>
        <div><dt>Ukuran</dt><dd>{type.sizeLabel}</dd></div>
        <div><dt>Kamar mandi</dt><dd>{type.bathroom}</dd></div>
        <div><dt>Isi kamar</dt><dd>{type.extras}</dd></div>
      </dl>
    </>
  );
}

/** One room type in the /kamar list. `href` already carries any move-in date and plan from the booking bar. */
export default function TypeBlock({ type, href }: { type: TypeCard; href: string }) {
  const free = type.availability.free > 0;
  const next = type.availability.nextFree;
  return (
    <section className="rt">
      <div className="rt-head">
        <h2>{type.name}</h2>
        <span className="av" style={{ color: colorFor(type) }}>
          {availabilityLabel(type.availability)}
        </span>
      </div>
      <article className="room">
        <TypeGallery type={type} />
        <div className="info">
          <TypeFacts type={type} />
          <div className="buy">
            <div className="p"><b>{rp(type.monthlyPrice)}</b> <small>/ bulan</small></div>
            <a className={free ? "btn pri" : "btn"} href={href}>
              {free ? "Lihat & sewa" : next ? `Pesan mulai ${niceDate(notBeforeToday(next))}` : "Lihat tipe ini"}
            </a>
          </div>
        </div>
      </article>
    </section>
  );
}

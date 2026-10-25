import { prisma } from "@/lib/prisma";
import { NoData } from "@/components/site/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lokasi" };

export default async function LocationPage() {
  const [settings, nearby] = await Promise.all([
    prisma.propertySetting.findUnique({ where: { id: "default" } }),
    prisma.nearbyPlace.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  if (!settings) return <NoData />;

  return (
    <section className="page">
      <div className="sec-head">
        <div className="lbl">Lokasi</div>
        <h1>Sekitar kos.</h1>
        <p>{settings.address}. Jarak jalan kaki dari gerbang depan.</p>
      </div>
      {settings.mapsUrl ? (
        <a className="map" href={settings.mapsUrl} target="_blank" rel="noreferrer noopener" style={{ textDecoration: "none" }}>
          Buka di Google Maps
        </a>
      ) : (
        <div className="map" role="img" aria-label="Peta belum tersedia">Peta belum tersedia</div>
      )}
      {nearby.length ? (
        <div className="near-grid">
          {nearby.map((place) => (
            <div key={place.id} className="near">
              <b>{place.name}</b>
              <span>{place.distance}</span>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ color: "var(--ink-2)" }}>Belum ada isi.</p>
      )}
    </section>
  );
}

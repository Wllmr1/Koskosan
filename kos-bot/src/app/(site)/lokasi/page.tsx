import { prisma } from "@/lib/prisma";
import { PhotoSlot } from "@/components/site/PhotoSlot";
import { NoData, PageHead, Section } from "@/components/site/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lokasi" };

export default async function LocationPage() {
  const [settings, nearby] = await Promise.all([
    prisma.propertySetting.findUnique({ where: { id: "default" } }),
    prisma.nearbyPlace.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  if (!settings) return <NoData />;

  return (
    <>
      <PageHead title="Lokasi" sub={settings.address} />
      <Section title="Alamat">
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(min(280px,100%),1fr))", alignItems: "start" }}>
          <div>
            <p style={{ marginTop: 0 }}>{settings.address}</p>
            {settings.mapsUrl ? (
              <a className="btn btn-pri" href={settings.mapsUrl} target="_blank" rel="noreferrer noopener">Buka di Google Maps</a>
            ) : (
              <p className="muted small">Link Google Maps belum diisi.</p>
            )}
          </div>
          <PhotoSlot photo={null} alt="Peta lokasi" ratio="16 / 9" />
        </div>
      </Section>
      <Section title="Sekitar kos" sub="Jarak jalan kaki dari gerbang depan.">
        {nearby.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(180px,100%),1fr))", gap: 10 }}>
            {nearby.map((place) => (
              <div key={place.id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "11px 13px" }}>
                <strong style={{ display: "block", fontSize: 14.5 }}>{place.name}</strong>
                <span className="small muted">{place.distance}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted small">Belum ada isi.</p>
        )}
      </Section>
    </>
  );
}

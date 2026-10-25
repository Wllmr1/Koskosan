import { prisma } from "@/lib/prisma";
import { rp, wibNow } from "@/lib/money";
import { availabilityLabel, listRoomTypes, tagsOf } from "@/lib/room-types";
import { heroEyebrow, heroLead, heroPhotos, pickShowcase } from "@/lib/site";
import { CONTRACT_MONTHS, contractLabel } from "@/lib/contract-terms";
import { photoUrl } from "@/lib/photos";
import OpenChatButton from "@/components/OpenChatButton";
import { NoData } from "@/components/site/ui";

export const dynamic = "force-dynamic";

/**
 * Beranda: hero, booking bar, two showcased room types and a line into each other page.
 * Every figure comes from the same rows the assistant reads.
 */
export default async function HomePage() {
  const [settings, types, services, nearby, faqCount, gallery] = await Promise.all([
    prisma.propertySetting.findUnique({ where: { id: "default" } }),
    listRoomTypes(),
    prisma.service.count(),
    prisma.nearbyPlace.findMany({ orderBy: { sortOrder: "asc" }, take: 2 }),
    prisma.faqEntry.count(),
    prisma.photo.findMany({ where: { roomTypeId: null }, orderBy: { sortOrder: "asc" }, take: 3 }),
  ]);
  if (!settings) return <NoData />;

  const free = types.reduce((sum, t) => sum + t.availability.free, 0);
  const cheapest = types.length ? Math.min(...types.map((t) => t.monthlyPrice)) : 0;
  const hero = heroPhotos(gallery, types.map((t) => ({ slug: t.slug, cover: t.photos[0] ?? null })));
  const eyebrow = heroEyebrow(settings.tagline, settings.address);
  const showcase = pickShowcase(types);
  const lead = heroLead({ facilities: settings.facilities.length, types: types.length, cheapest, free }, rp);

  const doors = [
    { href: "/fasilitas", title: "Fasilitas", text: `${settings.facilities.length} fasilitas di dalam kos, ${services} layanan berbayar` },
    { href: "/biaya", title: "Biaya", text: `Kontrak ${contractLabel(CONTRACT_MONTHS[0])}–${contractLabel(CONTRACT_MONTHS[CONTRACT_MONTHS.length - 1])}, bayar per bulan` },
    { href: "/lokasi", title: "Lokasi", text: nearby.length ? nearby.map((n) => `${n.name}, ${n.distance}`).join("; ") : settings.address },
    { href: "/aturan", title: "Aturan", text: `${settings.houseRules.length} aturan rumah dan aturan tamu menginap` },
    { href: "/faq", title: "FAQ", text: `${faqCount} pertanyaan yang paling sering ditanyakan` },
  ];

  return (
    <>
      <section className="hero">
        <div className="lbl">{eyebrow}</div>
        <h1 style={{ marginTop: 22 }}>{settings.tagline}</h1>
        {lead && <p className="lead">{lead}</p>}
        <div className="cta">
          <OpenChatButton text="Halo, kamar apa saja yang masih kosong?">Tanya asisten</OpenChatButton>
          <a className="btn" href="/kamar">Lihat tipe kamar</a>
        </div>

        <div className="tri">
          {hero.length ? (
            hero.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.id} src={photoUrl(p.key)} alt={p.caption || settings.name} width={p.width} height={p.height} />
            ))
          ) : (
            <div className="ph" role="img" aria-label={`${settings.name}, foto segera hadir`}>Foto segera hadir</div>
          )}
        </div>

        <form className="book" action="/kamar" method="get">
          <div className="f">
            <label className="lbl" htmlFor="bt">Tipe kamar</label>
            <select id="bt" name="tipe" defaultValue="">
              <option value="">Semua tipe</option>
              {types.map((t) => (
                <option key={t.id} value={t.slug}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="f">
            <label className="lbl" htmlFor="bd">Tanggal masuk</label>
            <input id="bd" name="masuk" type="date" min={wibNow().date} />
          </div>
          <div className="f">
            <label className="lbl" htmlFor="bl">Lama kontrak</label>
            <select id="bl" name="lama" defaultValue="">
              <option value="">Pilih lama kontrak</option>
              {CONTRACT_MONTHS.map((m) => (
                <option key={m} value={m}>{contractLabel(m)}</option>
              ))}
            </select>
          </div>
          <button className="btn pri" type="submit">Cek ketersediaan</button>
        </form>
      </section>

      <section className="page" style={{ paddingTop: 96 }}>
        {showcase.length > 0 && (
          <>
            <div className="sec-head">
              <div className="lbl">Koleksi kamar</div>
              <h2>Pilih tipe kamar Anda.</h2>
              <p>
                Harga sudah termasuk kuota listrik {settings.electricQuota} kWh. {settings.utilitiesNote}.
              </p>
            </div>
            <div className="types" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(320px,100%),1fr))" }}>
              {showcase.map((t) => {
                const cover = t.photos[0];
                return (
                  <a key={t.id} className="type" href={`/kamar/${t.slug}`}>
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoUrl(cover.key)} alt={cover.caption || `Kamar ${t.name}`} width={cover.width} height={cover.height} style={{ height: 420 }} />
                    ) : (
                      <div className="ph" role="img" aria-label={`Kamar ${t.name}, foto segera hadir`}>Foto segera hadir</div>
                    )}
                    <span className="tag" style={{ display: "inline-block", marginTop: 16 }}>{tagsOf(t).join(" · ")}</span>
                    <h3 style={{ marginTop: 10 }}>{t.name}</h3>
                    <p>
                      {t.description.split("\n")[0]}
                      {t.description && " · "}
                      <b style={{ color: t.availability.free > 0 ? "var(--ok)" : "var(--warn)", fontWeight: 500 }}>
                        {availabilityLabel(t.availability)}
                      </b>
                    </p>
                  </a>
                );
              })}
            </div>
          </>
        )}
        <p style={{ marginTop: 28 }}>
          <a className="btn" href="/kamar">Lihat ketujuh tipe kamar</a>
        </p>
        <div className="doors">
          {doors.map((d) => (
            <a key={d.href} className="door" href={d.href}>
              <b>{d.title}</b>
              <span>{d.text}</span>
            </a>
          ))}
        </div>
      </section>
    </>
  );
}

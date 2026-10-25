import { RoomStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rp } from "@/lib/money";
import OpenChatButton from "@/components/OpenChatButton";
import { PhotoGrid, PhotoSlot } from "@/components/site/PhotoSlot";
import { NoData } from "@/components/site/ui";

export const dynamic = "force-dynamic";

/**
 * Beranda: a short welcome and a way into each page. The site is also the
 * assistant's information source — both read the same rows, so the bot can
 * never quote a price the site does not show.
 */
export default async function HomePage() {
  const [settings, rooms, services, nearby, faqCount, gallery] = await Promise.all([
    prisma.propertySetting.findUnique({ where: { id: "default" } }),
    prisma.room.findMany({ where: { hidden: false }, select: { status: true, roomType: { select: { monthlyPrice: true } } } }),
    prisma.service.count(),
    prisma.nearbyPlace.findMany({ orderBy: { sortOrder: "asc" }, take: 2 }),
    prisma.faqEntry.count(),
    prisma.photo.findMany({ where: { roomTypeId: null }, orderBy: { sortOrder: "asc" }, take: 8 }),
  ]);
  if (!settings) return <NoData />;

  const available = rooms.filter((r) => r.status === RoomStatus.AVAILABLE).length;
  const cheapest = rooms.length ? Math.min(...rooms.map((r) => r.roomType.monthlyPrice)) : 0;
  const [heroPhoto, ...restOfGallery] = gallery;

  const pages = [
    { href: "/kamar", title: "Kamar", text: `${available} dari ${rooms.length} kamar tersedia, mulai ${rp(cheapest)} per bulan.` },
    { href: "/fasilitas", title: "Fasilitas", text: `${settings.facilities.length} fasilitas di dalam kos dan ${services} layanan berbayar seperti laundry.` },
    { href: "/biaya", title: "Biaya", text: `Bulanan atau tahunan, bayar ${settings.yearlyMonths} bulan untuk 12. Deposit ${settings.depositMonths}× sewa.` },
    {
      href: "/lokasi",
      title: "Lokasi",
      text: nearby.length ? nearby.map((n) => `${n.name}, ${n.distance}`).join("; ") + "." : settings.address,
    },
    { href: "/aturan", title: "Aturan", text: `${settings.houseRules.length} aturan rumah dan cara mendaftarkan tamu menginap.` },
    { href: "/faq", title: "FAQ", text: `${faqCount} pertanyaan yang paling sering ditanyakan calon penghuni.` },
  ];

  return (
    <>
      <section className="hero">
        <div className="hero-text">
          <h1 className="hero-title">{settings.tagline}</h1>
          <p className="hero-sub">
            {settings.address}. Tanya apa saja ke asisten kami, kapan saja, langsung dibalas.
          </p>
          <div className="hero-actions">
            <OpenChatButton text="Halo, kamar apa saja yang masih kosong?">Tanya kamar kosong</OpenChatButton>
            <a className="btn" href="/kamar">Lihat semua kamar</a>
          </div>
          <dl className="hero-facts">
            <div><dt>Mulai per bulan</dt><dd>{rp(cheapest)}</dd></div>
            <div><dt>Kamar tersedia</dt><dd>{available} dari {rooms.length}</dd></div>
            <div><dt>Listrik termasuk</dt><dd>{settings.electricQuota} kWh</dd></div>
          </dl>
        </div>
        <div className="hero-arch">
          <PhotoSlot photo={heroPhoto ?? null} alt={settings.name} ratio="3 / 4" />
        </div>
      </section>

      <section className="home-gallery" aria-label="Foto kos">
        <PhotoGrid photos={restOfGallery} slots={3} alt={settings.name} min={200} />
      </section>

      <nav className="page-index" aria-label="Info kos">
        {pages.map((p) => (
          <a key={p.href} href={p.href} className="page-index-row">
            <span className="page-index-title">{p.title}</span>
            <span className="page-index-text">{p.text}</span>
          </a>
        ))}
      </nav>
    </>
  );
}

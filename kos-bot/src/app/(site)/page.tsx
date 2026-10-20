import { RoomStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rp } from "@/lib/money";
import OpenChatButton from "@/components/OpenChatButton";
import { PhotoGrid } from "@/components/site/PhotoSlot";
import { Fact, NoData } from "@/components/site/ui";

export const dynamic = "force-dynamic";

/**
 * Beranda: a short welcome and one card per page. The site is also the
 * assistant's information source — both read the same rows, so the bot can
 * never quote a price the site does not show.
 */
export default async function HomePage() {
  const [settings, rooms, services, nearby, faqCount, gallery] = await Promise.all([
    prisma.propertySetting.findUnique({ where: { id: "default" } }),
    prisma.room.findMany({ where: { hidden: false }, select: { status: true, monthlyPrice: true } }),
    prisma.service.count(),
    prisma.nearbyPlace.findMany({ orderBy: { sortOrder: "asc" }, take: 2 }),
    prisma.faqEntry.count(),
    prisma.photo.findMany({ where: { roomId: null }, orderBy: { sortOrder: "asc" }, take: 8 }),
  ]);
  if (!settings) return <NoData />;

  const available = rooms.filter((r) => r.status === RoomStatus.AVAILABLE).length;
  const cheapest = rooms.length ? Math.min(...rooms.map((r) => r.monthlyPrice)) : 0;

  const cards = [
    { href: "/kamar", title: "Kamar", text: `${available} dari ${rooms.length} kamar tersedia, mulai ${rp(cheapest)} per bulan.` },
    { href: "/fasilitas", title: "Fasilitas", text: `${settings.facilities.length} fasilitas di dalam kos dan ${services} layanan berbayar seperti laundry.` },
    { href: "/biaya", title: "Biaya", text: `Bulanan atau tahunan (bayar ${settings.yearlyMonths} bulan untuk 12). Deposit ${settings.depositMonths}× sewa.` },
    {
      href: "/lokasi",
      title: "Lokasi",
      text: nearby.length ? `${nearby.map((n) => `${n.name} ${n.distance}`).join(", ")}.` : settings.address,
    },
    { href: "/aturan", title: "Aturan", text: `${settings.houseRules.length} aturan rumah, plus cara mendaftarkan tamu menginap.` },
    { href: "/faq", title: "FAQ", text: `${faqCount} pertanyaan yang paling sering ditanyakan calon penghuni.` },
  ];

  return (
    <>
      <section className="card" style={{ padding: "34px 30px 28px", marginBottom: 20 }}>
        <h1 style={{ fontSize: "clamp(30px,4.5vw,46px)", maxWidth: "16ch" }}>{settings.tagline}</h1>
        <p className="muted" style={{ maxWidth: "58ch", margin: "14px 0 20px" }}>
          {settings.address}. Tanya apa saja ke asisten kami, 24 jam, langsung dibalas.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <OpenChatButton text="Halo, kamar apa saja yang masih kosong?">Tanya kamar kosong</OpenChatButton>
          <a className="btn" href="/kamar">Lihat semua kamar</a>
        </div>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", borderTop: "1px solid var(--line)", marginTop: 24, paddingTop: 18 }}>
          <Fact value={rp(cheapest)} label="mulai per bulan" />
          <Fact value={`${available} / ${rooms.length}`} label="kamar tersedia" />
          <Fact value={`${settings.electricQuota} kWh`} label="listrik termasuk" />
          <Fact value={`tanggal ${settings.dueDayOfMonth}`} label="jatuh tempo sewa" />
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <PhotoGrid photos={gallery} slots={4} alt={settings.name} />
      </section>

      <section className="link-grid" aria-label="Info kos">
        {cards.map((c) => (
          <a key={c.href} href={c.href} className="link-card">
            <strong>{c.title}</strong>
            <span className="small muted">{c.text}</span>
            <span className="more">Lihat {c.title.toLowerCase()} →</span>
          </a>
        ))}
      </section>
    </>
  );
}

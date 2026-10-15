import { RoomStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { niceDate, rp } from "@/lib/money";
import { botChatLink } from "@/lib/whatsapp";

export const revalidate = 60;

const STATUS_LABEL: Record<RoomStatus, string> = {
  AVAILABLE: "Tersedia",
  BOOKED: "Sudah dibooking",
  OCCUPIED: "Terisi",
  MAINTENANCE: "Perbaikan",
};

/**
 * The public property site. It is also the assistant's information source —
 * both read the same rows, so the bot can never quote a price the site
 * does not show.
 */
export default async function HomePage() {
  const [settings, rooms, services, nearby, faq] = await Promise.all([
    prisma.propertySetting.findUnique({ where: { id: "default" } }),
    prisma.room.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    prisma.service.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.nearbyPlace.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.faqEntry.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  if (!settings) {
    return (
      <main className="wrap" style={{ padding: "80px 20px" }}>
        <h1>Belum ada data</h1>
        <p className="muted">Jalankan `npm run db:seed` untuk mengisi data awal.</p>
      </main>
    );
  }

  const available = rooms.filter((r) => r.status === RoomStatus.AVAILABLE);
  const cheapest = rooms.reduce((min, r) => Math.min(min, r.monthlyPrice), Infinity);
  const waLink = botChatLink("Halo, saya cari kos dekat kampus");

  return (
    <main>
      <header style={{ borderBottom: "1px solid var(--line)", background: "var(--paper)" }}>
        <div
          className="wrap"
          style={{ display: "flex", alignItems: "center", gap: 18, padding: "14px 20px", flexWrap: "wrap" }}
        >
          <strong style={{ fontFamily: "var(--display)", fontSize: 18 }}>{settings.name}</strong>
          <nav style={{ display: "flex", gap: 16, fontSize: 15 }} className="muted">
            <a href="#kamar" style={{ color: "inherit", textDecoration: "none" }}>Kamar</a>
            <a href="#fasilitas" style={{ color: "inherit", textDecoration: "none" }}>Fasilitas</a>
            <a href="#biaya" style={{ color: "inherit", textDecoration: "none" }}>Biaya</a>
            <a href="#faq" style={{ color: "inherit", textDecoration: "none" }}>FAQ</a>
          </nav>
          <a className="btn btn-pri" href={waLink} style={{ marginLeft: "auto" }}>
            Chat di WhatsApp
          </a>
        </div>
      </header>

      <div className="wrap" style={{ padding: "28px 20px 60px" }}>
        <section className="card" style={{ padding: "34px 30px 28px", marginBottom: 20 }}>
          <h1 style={{ fontSize: "clamp(30px,4.5vw,46px)", maxWidth: "16ch" }}>{settings.tagline}</h1>
          <p className="muted" style={{ maxWidth: "58ch", margin: "14px 0 20px" }}>
            {settings.address}. Tanya apa saja ke asisten WhatsApp kami, 24 jam, langsung dibalas.
          </p>
          <a className="btn btn-pri" href={waLink}>Tanya kamar kosong</a>

          <div
            style={{
              display: "flex",
              gap: 28,
              flexWrap: "wrap",
              borderTop: "1px solid var(--line)",
              marginTop: 24,
              paddingTop: 18,
            }}
          >
            <Fact value={rp(cheapest)} label="mulai per bulan" />
            <Fact value={`${available.length} / ${rooms.length}`} label="kamar tersedia" />
            <Fact value={`${settings.electricQuota} kWh`} label="listrik termasuk" />
            <Fact value={`tanggal ${settings.dueDayOfMonth}`} label="jatuh tempo sewa" />
          </div>
        </section>

        <Section id="kamar" title="Kamar" sub="Harga termasuk wifi, air, dan kuota listrik. Deposit satu bulan, dikembalikan setelah cek kamar.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(232px,1fr))", gap: 14 }}>
            {rooms.map((room) => (
              <article
                key={room.id}
                style={{ border: "1px solid var(--line)", borderRadius: 14, padding: "14px 15px 15px" }}
              >
                <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 16 }}>
                  {room.code} · {room.type}
                </div>
                <div className="small muted">
                  {room.sizeLabel} · lantai {room.floor} · {room.bathroom}
                </div>
                <div style={{ fontWeight: 600, marginTop: 6 }}>
                  {rp(room.monthlyPrice)} <span className="small muted">/bulan</span>
                </div>
                <div className="small muted" style={{ marginTop: 4 }}>{room.extras}</div>
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`pill ${room.status === "AVAILABLE" ? "pill-ok" : room.status === "BOOKED" ? "pill-warn" : "pill-mute"}`}>
                    {STATUS_LABEL[room.status]}
                  </span>
                  <span className="small muted">
                    {room.status === "AVAILABLE"
                      ? "bisa masuk sekarang"
                      : room.availableOn
                        ? `kosong ${niceDate(room.availableOn)}`
                        : ""}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </Section>

        <Section id="fasilitas" title="Fasilitas dan layanan" sub="Yang sudah ada di dalam kos, dan yang bisa dipesan lewat asisten.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 22 }}>
            <div>
              <h3 style={{ fontSize: 15, marginBottom: 10 }}>Di dalam kos</h3>
              <List items={settings.facilities} />
            </div>
            <div>
              <h3 style={{ fontSize: 15, marginBottom: 10 }}>Layanan berbayar</h3>
              <List items={services.map((s) => `${s.name} — ${s.priceNote}`)} />
            </div>
          </div>
        </Section>

        <Section id="biaya" title="Biaya dan cara bayar" sub="Angka di halaman ini adalah sumber data yang dipakai asisten. Asisten tidak bisa memberi diskon.">
          <table>
            <thead>
              <tr>
                <th>Pos</th>
                <th>Keterangan</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Deposit</td>
                <td>1× sewa bulanan, dikembalikan maksimal 14 hari setelah keluar</td>
              </tr>
              <tr>
                <td>Bayar tahunan</td>
                <td>{settings.yearlyMonths} bulan untuk 12 bulan sewa</td>
              </tr>
              <tr>
                <td>Listrik</td>
                <td>
                  Kuota {settings.electricQuota} kWh/bulan termasuk. Kelebihan {rp(settings.electricRate)}/kWh.
                </td>
              </tr>
              <tr>
                <td>Air dan wifi</td>
                <td>Termasuk, tanpa batas</td>
              </tr>
              <tr>
                <td>Tamu menginap</td>
                <td>{rp(settings.guestFeePerNight)} per malam, maksimal 3 malam berturut-turut</td>
              </tr>
              <tr>
                <td>Denda telat bayar</td>
                <td>
                  {rp(settings.lateFeePerDay)}/hari setelah tanggal {settings.dueDayOfMonth}, maksimal{" "}
                  {rp(settings.lateFeeMax)}
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 22, marginTop: 22 }}>
            <div>
              <h3 style={{ fontSize: 15, marginBottom: 10 }}>Syarat pembayaran</h3>
              <List items={settings.paymentTerms} />
            </div>
            <div>
              <h3 style={{ fontSize: 15, marginBottom: 10 }}>Aturan tamu menginap</h3>
              <List items={settings.guestRules} />
            </div>
          </div>
        </Section>

        <Section id="sekitar" title="Sekitar kos" sub="Jarak jalan kaki dari gerbang depan.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
            {nearby.map((place) => (
              <div key={place.id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "11px 13px" }}>
                <strong style={{ display: "block", fontSize: 14.5 }}>{place.name}</strong>
                <span className="small muted">{place.distance}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section id="faq" title="Pertanyaan umum" sub="Asisten menjawab dari daftar yang sama.">
          {faq.map((entry) => (
            <details key={entry.id} style={{ borderBottom: "1px solid var(--line)", padding: "12px 0" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>{entry.question}</summary>
              <p className="muted" style={{ margin: "8px 0 0", fontSize: 15 }}>{entry.answer}</p>
            </details>
          ))}
        </Section>

        <Section id="aturan" title="Aturan rumah" sub="Berlaku untuk semua penghuni.">
          <List items={settings.houseRules} />
        </Section>

        <footer className="small muted" style={{ marginTop: 34, textAlign: "center" }}>
          {settings.name} · {settings.address}
          <br />
          Data pribadi penyewa disimpan terenkripsi sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.
        </footer>
      </div>
    </main>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <strong style={{ fontFamily: "var(--display)", fontSize: 22, display: "block" }}>{value}</strong>
      <span className="small muted">{label}</span>
    </div>
  );
}

function Section({ id, title, sub, children }: { id: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card" style={{ padding: 26, marginBottom: 20, scrollMarginTop: 76 }}>
      <h2 style={{ fontSize: 22 }}>{title}</h2>
      <p className="muted small" style={{ margin: "4px 0 18px" }}>{sub}</p>
      {children}
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item, i) => (
        <li key={i} className="muted" style={{ fontSize: 14.5, paddingLeft: 16, position: "relative" }}>
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              top: ".6em",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--brand)",
            }}
          />
          {item}
        </li>
      ))}
    </ul>
  );
}

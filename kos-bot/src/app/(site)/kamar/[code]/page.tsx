import { notFound } from "next/navigation";
import { RoomStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { niceDate, rp } from "@/lib/money";
import { PhotoGrid } from "@/components/site/PhotoSlot";
import { onboardingAmount } from "@/lib/application";
import OpenChatButton from "@/components/OpenChatButton";

export const dynamic = "force-dynamic";

const STATUS: Record<RoomStatus, string> = {
  AVAILABLE: "Tersedia, bisa masuk sekarang",
  BOOKED: "Sudah dibooking",
  OCCUPIED: "Terisi",
  MAINTENANCE: "Sedang diperbaiki",
};

async function load(code: string) {
  if (!/^[A-Za-z0-9-]{2,12}$/.test(code)) return null;
  return prisma.room.findFirst({
    where: { code: code.toUpperCase(), hidden: false },
    include: { roomType: { include: { photos: { orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }] } } } },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const room = await load((await params).code);
  return { title: room ? `Kamar ${room.code} · ${room.roomType.name}` : "Kamar tidak ditemukan" };
}

const RENT_NOTICE: Record<string, string> = {
  penuh: "Maaf, kamar ini baru saja diambil orang lain. Pilih kamar lain atau tanya lewat chat.",
  batas: "Terlalu banyak pendaftaran dari jaringan ini dalam satu jam. Coba lagi nanti, atau tanya lewat chat.",
  "tidak-ada": "Kamar ini sudah tidak tersedia untuk disewa.",
};

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ sewa?: string }>;
}) {
  const room = await load((await params).code);
  if (!room) notFound();
  const { sewa } = await searchParams;
  const settings = await prisma.propertySetting.findUniqueOrThrow({ where: { id: "default" } });
  const canRent = room.status === RoomStatus.AVAILABLE;
  const plans = [
    {
      value: "bulanan",
      label: "Bulanan",
      note: `Kontrak minimal ${settings.minMonths} bulan, bayar tiap tanggal ${settings.dueDayOfMonth}.`,
      total: onboardingAmount(room.roomType.monthlyPrice, "MONTHLY", settings.yearlyMonths, settings.depositMonths),
    },
    {
      value: "tahunan",
      label: "Tahunan",
      note: `Bayar ${settings.yearlyMonths} bulan untuk 12 bulan sewa.`,
      total: onboardingAmount(room.roomType.monthlyPrice, "YEARLY", settings.yearlyMonths, settings.depositMonths),
    },
  ];

  return (
    <>
      <a href="/kamar" className="small">← Semua kamar</a>
      <h1 style={{ fontSize: "clamp(30px,4.5vw,48px)", margin: "12px 0 6px" }}>
        Kamar {room.code}
      </h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {room.roomType.name}, {room.roomType.sizeLabel}, lantai {room.floor}, {room.roomType.bathroom.toLowerCase()}
      </p>

      <section style={{ margin: "18px 0" }}>
        <PhotoGrid photos={room.roomType.photos} slots={3} alt={`Kamar ${room.code}`} min={260} />
      </section>

      <div className="room-layout">
      <section className="panel" style={{ display: "grid", gap: 10 }}>
        <p className="room-price room-price-lg">
          {rp(room.roomType.monthlyPrice)} <span>per bulan</span>
        </p>
        <p className="small" style={{ margin: 0 }}>
          {STATUS[room.status]}
          {room.status !== RoomStatus.AVAILABLE && room.availableOn ? ` · kosong ${niceDate(room.availableOn)}` : ""}
        </p>
        <p className="muted" style={{ margin: 0 }}>Isi kamar: {room.roomType.extras}</p>
        {room.roomType.description && <p style={{ margin: 0, whiteSpace: "pre-line" }}>{room.roomType.description}</p>}
        <p className="muted small" style={{ margin: 0 }}>
          Termasuk kuota listrik {settings.electricQuota} kWh/bulan. {settings.utilitiesNote}. Deposit {settings.depositMonths}× sewa.
        </p>
        <div>
          <OpenChatButton className="btn" text={`Saya tertarik kamar ${room.code}`}>Tanya kamar ini</OpenChatButton>
        </div>
      </section>

      <aside className="panel rent-box" id="sewa">
        <h2 className="panel-title">Sewa kamar ini</h2>
        {sewa && RENT_NOTICE[sewa] && <p className="rent-notice">{RENT_NOTICE[sewa]}</p>}
        {canRent ? (
          <form method="post" action="/api/apply/start">
            <input type="hidden" name="room" value={room.code} />
            <fieldset className="plan-options">
              <legend>Cara bayar</legend>
              {plans.map((p, i) => (
                <label key={p.value} className="plan-option">
                  <input type="radio" name="plan" value={p.value} defaultChecked={i === 0} />
                  <span>
                    <strong>{p.label}</strong>
                    <span className="small muted">{p.note}</span>
                    <span className="small">Pembayaran pertama {rp(p.total)}, termasuk deposit</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <button className="btn btn-pri" type="submit" style={{ width: "100%" }}>Lanjut ke formulir</button>
            <p className="small muted" style={{ margin: "12px 0 0" }}>
              Isi data diri dan foto KTP, baca dan tanda tangani kontrak, lalu bayar. Semua di halaman aman, tanpa chat.
            </p>
          </form>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            Kamar ini sedang tidak bisa disewa.
            {room.availableOn ? ` Perkiraan kosong ${niceDate(room.availableOn)}.` : ""} Lihat <a href="/kamar">kamar lain</a> atau tanya lewat chat.
          </p>
        )}
      </aside>
      </div>
    </>
  );
}

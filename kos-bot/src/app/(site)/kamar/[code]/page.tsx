import { notFound } from "next/navigation";
import { RoomStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { niceDate, rp } from "@/lib/money";
import { PhotoGrid } from "@/components/site/PhotoSlot";
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
    include: { photos: { orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }] } },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const room = await load((await params).code);
  return { title: room ? `Kamar ${room.code} · ${room.type}` : "Kamar tidak ditemukan" };
}

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const room = await load((await params).code);
  if (!room) notFound();
  const settings = await prisma.propertySetting.findUniqueOrThrow({ where: { id: "default" } });

  return (
    <>
      <a href="/kamar" className="small">← Semua kamar</a>
      <h1 style={{ fontSize: "clamp(26px,4vw,38px)", margin: "10px 0 4px" }}>
        Kamar {room.code} · {room.type}
      </h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {room.sizeLabel} · lantai {room.floor} · {room.bathroom}
      </p>

      <section style={{ margin: "18px 0" }}>
        <PhotoGrid photos={room.photos} slots={3} alt={`Kamar ${room.code}`} min={260} />
      </section>

      <section className="card" style={{ padding: 22, display: "grid", gap: 10 }}>
        <p style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
          {rp(room.monthlyPrice)} <span className="small muted">/bulan</span>
        </p>
        <p className="small" style={{ margin: 0 }}>
          {STATUS[room.status]}
          {room.status !== RoomStatus.AVAILABLE && room.availableOn ? ` · kosong ${niceDate(room.availableOn)}` : ""}
        </p>
        <p className="muted" style={{ margin: 0 }}>Isi kamar: {room.extras}</p>
        {room.description && <p style={{ margin: 0, whiteSpace: "pre-line" }}>{room.description}</p>}
        <p className="muted small" style={{ margin: 0 }}>
          Termasuk kuota listrik {settings.electricQuota} kWh/bulan. {settings.utilitiesNote}. Deposit {settings.depositMonths}× sewa.
        </p>
        <div>
          <OpenChatButton text={`Saya tertarik kamar ${room.code}`}>Tanya kamar ini</OpenChatButton>
        </div>
      </section>
    </>
  );
}

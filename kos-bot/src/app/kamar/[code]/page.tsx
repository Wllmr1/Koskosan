import { notFound } from "next/navigation";
import { RoomStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { niceDate, rp } from "@/lib/money";
import { photoUrl } from "@/lib/photos";
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
    <main className="wrap" style={{ padding: "24px 20px 80px" }}>
      <a href="/#kamar" className="small">← Semua kamar</a>
      <h1 style={{ fontSize: "clamp(26px,4vw,38px)", margin: "10px 0 4px" }}>
        Kamar {room.code} · {room.type}
      </h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {room.sizeLabel} · lantai {room.floor} · {room.bathroom}
      </p>

      {room.photos.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 10, margin: "18px 0" }}>
          {room.photos.map((p) => (
            <figure key={p.id} style={{ margin: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl(p.key)} alt={p.caption || `Kamar ${room.code}`} width={p.width} height={p.height}
                style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 14, display: "block" }} />
              {p.caption && <figcaption className="small muted" style={{ marginTop: 4 }}>{p.caption}</figcaption>}
            </figure>
          ))}
        </div>
      ) : (
        <p className="muted small">Foto kamar ini belum tersedia.</p>
      )}

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
    </main>
  );
}

import { ApplicationStatus, LeaseStatus, RoomStatus, TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { niceDate, rp } from "@/lib/money";
import { loadBills } from "@/lib/admin-bills";

export const dynamic = "force-dynamic";

const ROOM_COLORS: Record<RoomStatus, string> = {
  OCCUPIED: "var(--occ)",
  BOOKED: "#D9A441",
  AVAILABLE: "#5FA67A",
  MAINTENANCE: "#C9566B",
};
const ROOM_LABEL: Record<RoomStatus, string> = { OCCUPIED: "Terisi", BOOKED: "Dibooking", AVAILABLE: "Tersedia", MAINTENANCE: "Perbaikan" };
const IN_PROGRESS: ApplicationStatus[] = [
  ApplicationStatus.DETAILS_SUBMITTED,
  ApplicationStatus.AWAITING_PAYMENT,
  ApplicationStatus.PROOF_SUBMITTED,
  ApplicationStatus.VERIFIED,
];
const APP_SHORT: Partial<Record<ApplicationStatus, string>> = {
  DETAILS_SUBMITTED: "baca syarat",
  AWAITING_PAYMENT: "menunggu transfer",
  PROOF_SUBMITTED: "bukti dikirim",
  VERIFIED: "tunggu tanda tangan",
};

function ago(d: Date, now: Date) {
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  return days <= 0 ? "hari ini" : days === 1 ? "kemarin" : `${days} hari lalu`;
}

/** Owner dashboard: one card per area, each opening its page. */
export default async function DashboardPage() {
  await requireAdmin();
  const now = new Date();

  const [bills, rooms, leases, tickets, apps, notifications, guests, botStats] = await Promise.all([
    loadBills(now),
    prisma.room.groupBy({ by: ["status"], where: { hidden: false }, _count: true }),
    prisma.lease.findMany({ where: { status: LeaseStatus.ACTIVE }, select: { endDate: true } }),
    prisma.ticket.findMany({
      where: { status: { not: TicketStatus.RESOLVED } },
      include: { tenant: { include: { leases: { where: { status: "ACTIVE" }, include: { room: true }, take: 1 } } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.application.findMany({
      where: { status: { in: IN_PROGRESS }, expiresAt: { gt: now } },
      include: { room: { include: { roomType: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.ownerNotification.findMany({ orderBy: { sentAt: "desc" }, take: 3 }),
    prisma.guestStay.count({ where: { checkIn: { gte: new Date(now.getTime() - 7 * 86_400_000) } } }),
    prisma.auditLog.findMany({
      where: { action: "reply", createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } },
      select: { meta: true },
      take: 2000,
    }),
  ]);

  const pending = bills.filter((b) => b.state === "pending");
  const late = bills.filter((b) => b.state === "late" && !b.prospect);
  const unpaid = bills.filter((b) => b.state !== "paid" && b.state !== "closed");
  const unpaidBy = (kinds: string[]) => unpaid.filter((b) => kinds.includes(b.kind)).reduce((s, b) => s + b.remaining, 0);
  const unpaidTotal = unpaid.reduce((s, b) => s + b.remaining, 0);

  const roomCount = Object.fromEntries(rooms.map((r) => [r.status, r._count])) as Partial<Record<RoomStatus, number>>;
  const totalRooms = rooms.reduce((s, r) => s + r._count, 0);
  const endingSoon = leases.filter((l) => l.endDate.getTime() - now.getTime() <= 60 * 86_400_000).length;
  const urgent = tickets.filter((t) => t.urgency === "darurat");
  const aiCost = botStats.reduce((sum, row) => {
    const meta = row.meta as { costUsd?: number } | null;
    return sum + (typeof meta?.costUsd === "number" ? meta.costUsd : 0);
  }, 0);

  return (
    <div className="tiles">
      <a className="tile" href="/admin/tagihan?status=verifikasi">
        <div className="h">Perlu verifikasi <span className={pending.length ? "pend" : ""}>{pending.length ? `${pending.length} bukti baru` : "kosong"}</span></div>
        <div className="b">
          <div className="big">{pending.length}</div>
          <div className="lbl">bukti transfer menunggu dicek</div>
          <div className="mini">
            {pending.slice(0, 3).map((b) => (
              <div key={b.id}><span>{b.payer.split(" ")[0]} · {b.kindLabel}</span><span>{ago(b.pendingProof!.uploadedAt, now)}</span></div>
            ))}
          </div>
        </div>
      </a>

      <a className="tile" href="/admin/tagihan?status=terlambat">
        <div className="h">Terlambat <span className={late.length ? "bad" : ""}>{late.length} tagihan</span></div>
        <div className="b">
          <div className="big">{rp(late.reduce((s, b) => s + b.remaining, 0))}</div>
          <div className="lbl">lewat jatuh tempo</div>
          <div className="mini">
            {late.slice(0, 3).map((b) => (
              <div key={b.id}><span>{b.payer.split(" ")[0]} · {b.kindLabel} {b.where}</span><span>{b.daysLate} hari</span></div>
            ))}
          </div>
        </div>
      </a>

      <a className="tile" href="/admin/tagihan?status=belum">
        <div className="h">Tagihan <span>belum dibayar</span></div>
        <div className="b">
          <div className="big">{rp(unpaidTotal)}</div>
          <div className="lbl">{unpaid.length} tagihan terbuka</div>
          <div className="mini">
            <div><span>Sewa</span><span>{rp(unpaidBy(["RENT", "ONBOARDING"]))}</span></div>
            <div><span>Listrik</span><span>{rp(unpaidBy(["UTILITY_OVERAGE"]))}</span></div>
            <div><span>Deposit</span><span>{rp(unpaidBy(["DEPOSIT"]))}</span></div>
          </div>
        </div>
      </a>

      <a className="tile wide" href="/admin/kamar">
        <div className="h">Kamar <span>{totalRooms} kamar</span></div>
        <div className="b">
          <div className="big">{roomCount.AVAILABLE ?? 0} kosong</div>
          <div className="lbl">bisa langsung ditawarkan asisten</div>
          <div className="stack">
            {(Object.keys(ROOM_COLORS) as RoomStatus[]).map((s) =>
              roomCount[s] ? <i key={s} style={{ flex: roomCount[s], background: ROOM_COLORS[s] }} /> : null
            )}
          </div>
          <div className="legend">
            {(Object.keys(ROOM_COLORS) as RoomStatus[]).map((s) => (
              <span key={s} style={{ "--c": ROOM_COLORS[s] } as React.CSSProperties}>{ROOM_LABEL[s]} {roomCount[s] ?? 0}</span>
            ))}
          </div>
        </div>
      </a>

      <a className="tile" href="/admin/penghuni">
        <div className="h">Penghuni <span>aktif</span></div>
        <div className="b">
          <div className="big">{leases.length}</div>
          <div className="lbl">penghuni aktif</div>
          <div className="mini"><div><span>Kontrak habis ≤ 60 hari</span><span>{endingSoon}</span></div></div>
        </div>
      </a>

      <a className="tile" href="/admin/keluhan">
        <div className="h">Keluhan <span className={urgent.length ? "bad" : ""}>{urgent.length ? `${urgent.length} darurat` : "terbuka"}</span></div>
        <div className="b">
          <div className="big">{tickets.length}</div>
          <div className="lbl">keluhan terbuka</div>
          <div className="mini">
            {tickets.slice(0, 2).map((t) => (
              <div key={t.id}><span>{t.category} · {t.tenant.leases[0]?.room.code ?? t.tenant.fullName.split(" ")[0]}</span><span>{niceDate(t.createdAt)}</span></div>
            ))}
          </div>
        </div>
      </a>

      <a className="tile" href="/admin/pendaftaran">
        <div className="h">Pendaftaran <span>berjalan</span></div>
        <div className="b">
          <div className="big">{apps.length}</div>
          <div className="lbl">calon penghuni sedang mendaftar</div>
          <div className="mini">
            {apps.slice(0, 3).map((a) => (
              <div key={a.id}><span>{a.fullName ?? a.reference} · {a.room.roomType.name}</span><span>{APP_SHORT[a.status]}</span></div>
            ))}
          </div>
        </div>
      </a>

      <a className="tile wide" href="/admin/notifikasi">
        <div className="h">Notifikasi terakhir <span>juga dikirim ke email dan WhatsApp</span></div>
        <div className="b">
          <div className="mini" style={{ marginTop: 0 }}>
            {notifications.length === 0 && <div><span className="mute">Belum ada notifikasi.</span></div>}
            {notifications.map((n) => (
              <div key={n.id}><span>{n.subject}</span><span>{n.sentAt.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</span></div>
            ))}
          </div>
        </div>
      </a>

      <a className="tile" href="/admin/tamu">
        <div className="h">Tamu menginap <span>7 hari</span></div>
        <div className="b"><div className="big">{guests}</div><div className="lbl">tamu terdaftar minggu ini</div></div>
      </a>

      <a className="tile" href="/admin/percakapan">
        <div className="h">Asisten <span>30 hari</span></div>
        <div className="b"><div className="big">${aiCost.toFixed(2)}</div><div className="lbl">biaya AI · {botStats.length} balasan</div></div>
      </a>
    </div>
  );
}

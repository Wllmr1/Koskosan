import { redirect } from "next/navigation";
import { InvoiceStatus, RoomStatus, TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { niceDate, rp } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Owner dashboard: who signed, who owes, what is broken, what the bot did. */
const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  AVAILABLE: "Tersedia",
  BOOKED: "Dibooking",
  OCCUPIED: "Terisi",
  MAINTENANCE: "Perbaikan",
};

const ROOM_NOTICE: Record<string, { text: string; tone: "ok" | "bad" }> = {
  saved: { text: "Kamar disimpan. Situs dan asisten sudah memakai data baru.", tone: "ok" },
  invalid: { text: "Data kamar tidak valid, tidak ada yang diubah.", tone: "bad" },
  occupied: { text: "Kamar ini masih punya penghuni aktif, jadi tidak bisa dibuat tersedia.", tone: "bad" },
};

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ room?: string }> }) {
  const who = await requireAdmin();
  const { room: roomNotice } = await searchParams;

  const [notifications, leases, unpaid, tickets, guests, applications, botStats, rooms] = await Promise.all([
    prisma.ownerNotification.findMany({ orderBy: { sentAt: "desc" }, take: 15 }),
    prisma.lease.findMany({
      where: { status: "ACTIVE" },
      include: { tenant: true, room: { include: { roomType: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.invoice.findMany({
      where: { status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL] } },
      include: { lease: { include: { tenant: true, room: true } } },
      orderBy: { dueDate: "asc" },
      take: 25,
    }),
    prisma.ticket.findMany({
      where: { status: { not: TicketStatus.RESOLVED } },
      include: { tenant: true },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    prisma.guestStay.findMany({
      where: { checkIn: { gte: new Date(Date.now() - 7 * 86_400_000) } },
      include: { tenant: true },
      orderBy: { checkIn: "desc" },
      take: 15,
    }),
    prisma.application.findMany({
      where: { status: { in: ["DETAILS_SUBMITTED", "SIGNED", "AWAITING_PAYMENT", "COMPLETED"] } },
      include: { room: true },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    prisma.auditLog.findMany({
      where: { action: "reply", createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
      select: { meta: true },
      take: 2000,
    }),
    prisma.room.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }], include: { roomType: true } }),
  ]);
  const notice = roomNotice ? ROOM_NOTICE[roomNotice] : undefined;

  const monthlyCost = botStats.reduce((sum, row) => {
    const meta = row.meta as { costUsd?: number } | null;
    return sum + (typeof meta?.costUsd === "number" ? meta.costUsd : 0);
  }, 0);

  const owed = unpaid.reduce((sum, i) => sum + (i.amount - i.amountPaid), 0);
  const today = new Date();

  return (
    <main className="wrap" style={{ padding: "26px 20px 60px" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24 }}>Dashboard pemilik</h1>
        <span className="muted small" style={{ marginLeft: "auto" }}>Masuk sebagai {who.name}</span>
        <a className="btn" href="/">Lihat situs</a>
        <a className="btn" href="/admin/data">Data kos</a>
        <a className="btn" href="/admin/percakapan">Percakapan</a>
        <a className="btn" href="/admin/penghuni/baru">Tambah penghuni</a>
        <a className="btn" href="/admin/meteran">Catat meteran</a>
        {who.isOwner && <a className="btn" href="/admin/admin">Kelola admin</a>}
        <a className="btn" href="/api/admin/logout">Keluar</a>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14, marginBottom: 24 }}>
        <Stat label="Penghuni aktif" value={String(leases.length)} />
        <Stat label="Belum dibayar" value={rp(owed)} tone={owed > 0 ? "warn" : "ok"} />
        <Stat label="Keluhan terbuka" value={String(tickets.length)} tone={tickets.some((t) => t.urgency === "darurat") ? "bad" : undefined} />
        <Stat label="Biaya AI 30 hari" value={`$${monthlyCost.toFixed(2)}`} />
      </div>

      <Panel title="Notifikasi terakhir" sub="Setiap kontrak, pembayaran, dan keluhan darurat dikirim ke email dan WhatsApp kakak.">
        {notifications.length === 0 ? (
          <Empty>Belum ada notifikasi.</Empty>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {notifications.map((n) => (
              <article key={n.id} style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 13px", background: "var(--wash)", borderBottom: "1px solid var(--line)" }}>
                  <strong style={{ fontSize: 13.5 }}>{n.title}</strong>
                  <span className="pill pill-mute small">{n.channels || "gagal terkirim"}</span>
                  {n.error && (
                    <span className="pill pill-warn small" title={n.error}>
                      {n.channels ? "sebagian gagal, dicoba ulang" : "dicoba ulang tiap jam"}
                    </span>
                  )}
                  <time className="small muted" style={{ marginLeft: "auto" }}>
                    {n.sentAt.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                  </time>
                </div>
                <div style={{ padding: "11px 14px" }}>
                  <strong style={{ fontSize: 14 }}>{n.subject}</strong>
                  <p className="muted small" style={{ whiteSpace: "pre-wrap", margin: "5px 0 0" }}>{n.body}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        id="kamar"
        title="Kamar dan ketersediaan"
        sub="Sumber data yang dibaca situs dan asisten. Kamar berstatus Tersedia langsung bisa ditawarkan asisten."
      >
        {notice && (
          <p
            className="small"
            style={{
              margin: "0 0 12px",
              padding: "8px 12px",
              borderRadius: 10,
              background: notice.tone === "ok" ? "var(--ok-soft)" : "var(--bad-soft)",
              color: notice.tone === "ok" ? "var(--ok)" : "var(--bad)",
            }}
          >
            {notice.text}
          </p>
        )}
        <table>
          <thead>
            <tr><th>Kamar</th><th>Status</th><th>Harga / bulan</th><th>Kosong mulai</th><th></th></tr>
          </thead>
          <tbody>
            {rooms.map((room) => {
              const formId = `room-${room.id}`;
              return (
                <tr key={room.id}>
                  <td>
                    <strong>{room.code}</strong>
                    <small>{room.roomType.name}</small>
                    <form id={formId} method="post" action="/api/admin/rooms">
                      <input type="hidden" name="roomId" value={room.id} />
                    </form>
                  </td>
                  <td>
                    <select form={formId} name="status" defaultValue={room.status} aria-label={`Status ${room.code}`}>
                      {Object.values(RoomStatus).map((s) => (
                        <option key={s} value={s}>{ROOM_STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {rp(room.roomType.monthlyPrice)}
                    <small><a href={`/admin/data/tipe/${room.roomTypeId}`}>Ubah harga tipe</a></small>
                  </td>
                  <td>
                    <input
                      form={formId}
                      name="availableOn"
                      type="date"
                      defaultValue={room.availableOn ? room.availableOn.toISOString().slice(0, 10) : ""}
                      aria-label={`Kosong mulai ${room.code}`}
                    />
                  </td>
                  <td>
                    <button className="btn" type="submit" form={formId}>Simpan</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <Panel title="Tagihan belum lunas">
        {unpaid.length === 0 ? (
          <Empty>Semua tagihan lunas.</Empty>
        ) : (
          <table>
            <thead>
              <tr><th>Tagihan</th><th>Penghuni</th><th>Jatuh tempo</th><th>Sisa</th></tr>
            </thead>
            <tbody>
              {unpaid.map((inv) => (
                <tr key={inv.id}>
                  <td><strong>{inv.code}</strong><small>{inv.description}</small></td>
                  <td>{inv.lease?.tenant.fullName ?? "-"}<small>{inv.lease?.room.code ?? ""}</small></td>
                  <td>
                    {niceDate(inv.dueDate)}
                    {inv.dueDate < today && <small style={{ color: "var(--bad)" }}>terlambat</small>}
                  </td>
                  <td>{rp(inv.amount - inv.amountPaid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Penghuni aktif">
        {leases.length === 0 ? (
          <Empty>Belum ada penghuni.</Empty>
        ) : (
          <table>
            <thead>
              <tr><th>Akun</th><th>Kamar</th><th>Skema</th><th>Kontrak</th><th>Dokumen</th><th>Akses</th></tr>
            </thead>
            <tbody>
              {leases.map((lease) => (
                <tr key={lease.id}>
                  <td>
                    <strong>{lease.tenant.fullName}</strong>
                    <small>{lease.tenant.accountCode}</small>
                    <small>KTP ••••{lease.tenant.idLast4}</small>
                  </td>
                  <td>{lease.room.code}<small>{lease.room.roomType.name}</small></td>
                  <td>{lease.plan === "YEARLY" ? "Tahunan" : "Bulanan"}<small>{rp(lease.monthlyRent)}/bln</small></td>
                  <td>{niceDate(lease.startDate)}<small>s/d {niceDate(lease.endDate)}</small></td>
                  <td>
                    {lease.contractKey && <a href={`/api/admin/file?key=${encodeURIComponent(lease.contractKey)}`} target="_blank" rel="noreferrer">Kontrak</a>}
                    {lease.tenant.ktpObjectKey && (
                      <>
                        {" · "}
                        <a href={`/api/admin/file?key=${encodeURIComponent(lease.tenant.ktpObjectKey)}`} target="_blank" rel="noreferrer">KTP</a>
                      </>
                    )}
                  </td>
                  <td>
                    <form method="post" action="/api/admin/password-link" target="_blank">
                      <input type="hidden" name="tenantId" value={lease.tenant.id} />
                      <button className="btn" type="submit" style={{ padding: "6px 10px", fontSize: 13 }}>
                        Buat link atur password
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Keluhan terbuka">
        {tickets.length === 0 ? (
          <Empty>Tidak ada keluhan.</Empty>
        ) : (
          <table>
            <thead><tr><th>Tiket</th><th>Penghuni</th><th>Kategori</th><th>Isi</th><th>Urgensi</th></tr></thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.code}</strong><small>{niceDate(t.createdAt)}</small></td>
                  <td>{t.tenant.fullName}</td>
                  <td>{t.category}</td>
                  <td>{t.description}</td>
                  <td><span className={`pill ${t.urgency === "darurat" ? "pill-warn" : "pill-mute"}`}>{t.urgency}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Tamu menginap">
        {guests.length === 0 ? (
          <Empty>Belum ada pendaftaran tamu.</Empty>
        ) : (
          <table>
            <thead><tr><th>Kode</th><th>Tamu</th><th>Host</th><th>Menginap</th><th>Status</th></tr></thead>
            <tbody>
              {guests.map((g) => (
                <tr key={g.id}>
                  <td><strong>{g.code}</strong></td>
                  <td>{g.guestName}<small>KTP ••••{g.idLast4}</small></td>
                  <td>{g.tenant.fullName}</td>
                  <td>{niceDate(g.checkIn)}<small>{g.nights} malam · {rp(g.fee)}</small></td>
                  <td><span className={`pill ${g.approved ? "pill-ok" : "pill-warn"}`}>{g.approved ? "disetujui" : "menunggu bayar"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Pendaftaran">
        {applications.length === 0 ? (
          <Empty>Belum ada pendaftaran.</Empty>
        ) : (
          <table>
            <thead><tr><th>Ref</th><th>Calon penghuni</th><th>Kamar</th><th>Status</th></tr></thead>
            <tbody>
              {applications.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.reference}</strong><small>{niceDate(a.createdAt)}</small></td>
                  <td>{a.fullName ?? "-"}{a.idLast4 && <small>KTP ••••{a.idLast4}</small>}</td>
                  <td>{a.room.code}</td>
                  <td><span className={`pill ${a.status === "COMPLETED" ? "pill-ok" : "pill-warn"}`}>{a.status.toLowerCase().replace(/_/g, " ")}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  const color = tone === "bad" ? "var(--bad)" : tone === "warn" ? "var(--gold)" : "var(--ink)";
  return (
    <div className="card" style={{ padding: "16px 18px" }}>
      <strong style={{ fontFamily: "var(--display)", fontSize: 22, display: "block", color }}>{value}</strong>
      <span className="small muted">{label}</span>
    </div>
  );
}

function Panel({ id, title, sub, children }: { id?: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card" style={{ padding: 22, marginBottom: 18, scrollMarginTop: 20 }}>
      <h2 style={{ fontSize: 18 }}>{title}</h2>
      {sub && <p className="muted small" style={{ margin: "4px 0 14px" }}>{sub}</p>}
      {!sub && <div style={{ height: 12 }} />}
      <div style={{ overflowX: "auto" }}>{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="muted small" style={{ textAlign: "center", padding: "20px 0", margin: 0 }}>{children}</p>;
}

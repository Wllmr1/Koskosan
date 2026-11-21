import { TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { niceDate } from "@/lib/money";

export const dynamic = "force-dynamic";

/** Open maintenance tickets, urgent first. */
export default async function TicketsPage() {
  await requireAdmin();
  const tickets = await prisma.ticket.findMany({
    where: { status: { not: TicketStatus.RESOLVED } },
    include: { tenant: { include: { leases: { where: { status: "ACTIVE" }, include: { room: true }, take: 1 } } } },
    orderBy: { createdAt: "desc" },
  });
  tickets.sort((a, b) => Number(b.urgency === "darurat") - Number(a.urgency === "darurat"));
  const urgent = tickets.filter((t) => t.urgency === "darurat").length;

  return (
    <>
      <a className="crumb" href="/admin">← Dashboard</a>
      <div className="panel">
        <div className="h"><b>Keluhan terbuka</b><span className={urgent ? "bad" : ""}>{urgent ? `${urgent} darurat` : `${tickets.length} keluhan`}</span></div>
        <div className="in">
          {tickets.length === 0 ? (
            <p className="empty">Tidak ada keluhan.</p>
          ) : (
            <table>
              <thead><tr><th>Tiket</th><th>Penghuni</th><th>Kategori</th><th>Isi</th><th>Urgensi</th></tr></thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td>{t.code}<small>{niceDate(t.createdAt)}</small></td>
                    <td>{t.tenant.fullName}<small>{t.tenant.leases[0]?.room.code ?? ""}</small></td>
                    <td>{t.category}</td>
                    <td>{t.description}</td>
                    <td><span className={`st ${t.urgency === "darurat" ? "bad" : t.urgency === "mendesak" ? "warn" : "mute"}`}>{t.urgency}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

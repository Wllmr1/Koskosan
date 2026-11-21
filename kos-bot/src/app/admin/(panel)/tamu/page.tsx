import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { niceDate, rp } from "@/lib/money";

export const dynamic = "force-dynamic";

/** Overnight guests registered in the last 7 days. */
export default async function GuestsPage() {
  await requireAdmin();
  const guests = await prisma.guestStay.findMany({
    where: { checkIn: { gte: new Date(Date.now() - 7 * 86_400_000) } },
    include: { tenant: { include: { leases: { where: { status: "ACTIVE" }, include: { room: true }, take: 1 } } } },
    orderBy: { checkIn: "desc" },
  });

  return (
    <>
      <a className="crumb" href="/admin">← Dashboard</a>
      <div className="panel">
        <div className="h"><b>Tamu menginap</b><span>7 hari terakhir</span></div>
        <div className="in">
          {guests.length === 0 ? (
            <p className="empty">Belum ada pendaftaran tamu.</p>
          ) : (
            <table>
              <thead><tr><th>Kode</th><th>Tamu</th><th>Host</th><th>Menginap</th><th>Status</th></tr></thead>
              <tbody>
                {guests.map((g) => (
                  <tr key={g.id}>
                    <td>{g.code}</td>
                    <td>{g.guestName}<small>KTP ••••{g.idLast4}</small></td>
                    <td>{g.tenant.fullName}<small>{g.tenant.leases[0]?.room.code ?? ""}</small></td>
                    <td>{niceDate(g.checkIn)} · {g.nights} malam<small>{rp(g.fee)}</small></td>
                    <td><span className={`st ${g.approved ? "ok" : "warn"}`}>{g.approved ? "Lunas" : "Menunggu bayar"}</span></td>
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

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Every alert sent to the owner, and whether email / WhatsApp got through. */
export default async function NotificationsPage() {
  await requireAdmin();
  const notifications = await prisma.ownerNotification.findMany({ orderBy: { sentAt: "desc" }, take: 50 });

  return (
    <>
      <a className="crumb" href="/admin">← Dashboard</a>
      <div className="panel">
        <div className="h"><b>Notifikasi</b><span>Setiap pembayaran, bukti transfer, pendaftaran, dan keluhan darurat dikirim ke email dan WhatsApp kakak.</span></div>
        <div className="in">
          {notifications.length === 0 ? (
            <p className="empty">Belum ada notifikasi.</p>
          ) : (
            <table>
              <thead><tr><th>Waktu</th><th>Jenis</th><th>Isi</th><th>Terkirim</th></tr></thead>
              <tbody>
                {notifications.map((n) => (
                  <tr key={n.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{n.sentAt.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</td>
                    <td>{n.title}</td>
                    <td>{n.subject}<small style={{ whiteSpace: "pre-wrap" }}>{n.body}</small></td>
                    <td>
                      {n.channels || <span className="bad">gagal</span>}
                      {n.error && <small className="warn">{n.channels ? "sebagian gagal, dicoba ulang" : "dicoba ulang tiap jam"}</small>}
                    </td>
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

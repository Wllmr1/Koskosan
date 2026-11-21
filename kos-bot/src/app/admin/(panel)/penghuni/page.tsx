import { LeaseStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { niceDate, rp } from "@/lib/money";

export const dynamic = "force-dynamic";

const fileUrl = (key: string) => `/api/admin/file?key=${encodeURIComponent(key)}`;

/** Active renters, their contract and documents, and the password link. */
export default async function TenantsPage() {
  await requireAdmin();
  const leases = await prisma.lease.findMany({
    where: { status: LeaseStatus.ACTIVE },
    include: { tenant: true, room: { include: { roomType: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <a className="crumb" href="/admin">← Dashboard</a>
      <div className="panel">
        <div className="h">
          <b>Penghuni aktif</b><span>{leases.length} penghuni</span>
          <a className="btn x" href="/admin/penghuni/baru">Tambah penghuni</a>
        </div>
        <div className="in">
          {leases.length === 0 ? (
            <p className="empty">Belum ada penghuni.</p>
          ) : (
            <table>
              <thead><tr><th>Akun</th><th>Kamar</th><th>Skema</th><th>Kontrak</th><th>Dokumen</th><th>Akses</th></tr></thead>
              <tbody>
                {leases.map((lease) => (
                  <tr key={lease.id}>
                    <td>{lease.tenant.fullName}<small>{lease.tenant.accountCode} · KTP ••••{lease.tenant.idLast4}</small></td>
                    <td>{lease.room.code}<small>{lease.room.roomType.name}</small></td>
                    <td>{lease.plan === "YEARLY" ? "Tahunan" : "Bulanan"}<small>{rp(lease.monthlyRent)}/bln</small></td>
                    <td>{niceDate(lease.startDate)}<small>s/d {niceDate(lease.endDate)}</small></td>
                    <td>
                      {lease.contractKey && <a href={fileUrl(lease.contractKey)} target="_blank" rel="noreferrer">Kontrak</a>}
                      {lease.contractKey && lease.tenant.ktpObjectKey && " · "}
                      {lease.tenant.ktpObjectKey && <a href={fileUrl(lease.tenant.ktpObjectKey)} target="_blank" rel="noreferrer">KTP</a>}
                    </td>
                    <td>
                      <form method="post" action="/api/admin/password-link" target="_blank">
                        <input type="hidden" name="tenantId" value={lease.tenant.id} />
                        <button className="btn" type="submit">Kirim link password</button>
                      </form>
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

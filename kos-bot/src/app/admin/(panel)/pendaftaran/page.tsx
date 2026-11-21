import { ApplicationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { niceDate } from "@/lib/money";

export const dynamic = "force-dynamic";

const STATUS: Partial<Record<ApplicationStatus, { text: string; tone: string }>> = {
  DRAFT: { text: "Baru dibuka", tone: "mute" },
  DETAILS_SUBMITTED: { text: "Data diisi, belum setuju syarat", tone: "warn" },
  SIGNED: { text: "Menunggu pembayaran", tone: "warn" },
  AWAITING_PAYMENT: { text: "Menunggu transfer deposit", tone: "warn" },
  PROOF_SUBMITTED: { text: "Bukti deposit perlu dicek", tone: "pend" },
  VERIFIED: { text: "Deposit lunas · kontrak belum ditandatangani", tone: "pend" },
  COMPLETED: { text: "Kontrak ditandatangani", tone: "ok" },
  NEEDS_REVIEW: { text: "Perlu dicek: nomor HP bentrok", tone: "bad" },
};
const NOTICE: Record<string, { text: string; tone: "ok" | "bad" }> = {
  signed: { text: "Kontrak dicatat. Kamar resmi milik penyewa dan penyewa sudah dikabari.", tone: "ok" },
};

/** Everyone signing up: where they are, and the button to record the paper contract once signed. */
export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireAdmin();
  const q = await searchParams;
  const apps = await prisma.application.findMany({
    where: {
      OR: [
        { status: { in: [ApplicationStatus.VERIFIED, ApplicationStatus.PROOF_SUBMITTED, ApplicationStatus.NEEDS_REVIEW] } },
        { status: { in: [ApplicationStatus.DETAILS_SUBMITTED, ApplicationStatus.AWAITING_PAYMENT] }, expiresAt: { gt: new Date() } },
        { status: ApplicationStatus.COMPLETED, createdAt: { gte: new Date(Date.now() - 60 * 86_400_000) } },
      ],
    },
    include: {
      room: { include: { roomType: true } },
      invoices: { where: { kind: "DEPOSIT" }, select: { code: true }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const notice = q.ok ? NOTICE[q.ok] : undefined;
  const open = apps.filter((a) => a.status !== ApplicationStatus.COMPLETED).length;

  return (
    <>
      <a className="crumb" href="/admin">← Dashboard</a>
      {notice && <p className="note">{notice.text}</p>}
      {q.error && <p className="note bad">{q.error}</p>}
      <div className="panel">
        <div className="h"><b>Pendaftaran</b><span>{open} berjalan</span></div>
        <div className="in">
          {apps.length === 0 ? (
            <p className="empty">Belum ada pendaftaran.</p>
          ) : (
            <table>
              <thead><tr><th>Ref</th><th>Calon penghuni</th><th>Kamar</th><th>Masuk</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {apps.map((a) => {
                  const st = STATUS[a.status] ?? { text: a.status, tone: "mute" };
                  return (
                    <tr key={a.id}>
                      <td>{a.reference}<small>{niceDate(a.createdAt)}</small></td>
                      <td>{a.fullName ?? "-"}{a.idLast4 && <small>KTP ••••{a.idLast4}</small>}</td>
                      <td>{a.room.code}<small>{a.room.roomType.name}</small></td>
                      <td>{a.moveInDate ? niceDate(a.moveInDate) : "-"}</td>
                      <td><span className={`st ${st.tone}`}>{st.text}</span></td>
                      <td>
                        {a.status === ApplicationStatus.PROOF_SUBMITTED && a.invoices[0] && (
                          <a className="btn pri" href={`/admin/tagihan/${a.invoices[0].code}`}>Cek bukti</a>
                        )}
                        {a.status === ApplicationStatus.VERIFIED && a.leaseId && (
                          <details>
                            <summary className="btn pri" style={{ listStyle: "none", cursor: "pointer" }}>Catat kontrak</summary>
                            <form method="post" action="/api/admin/kontrak" encType="multipart/form-data" style={{ display: "grid", gap: 8, marginTop: 10, minWidth: 240 }}>
                              <input type="hidden" name="leaseId" value={a.leaseId} />
                              <label className="small">Scan kontrak bertanda tangan (PDF, boleh dikosongkan)
                                <input type="file" name="scan" accept="application/pdf" />
                              </label>
                              <button className="btn pri" type="submit">Kontrak sudah ditandatangani</button>
                            </form>
                          </details>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

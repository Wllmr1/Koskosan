import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { niceDate, rp } from "@/lib/money";
import { billState, daysLate, KIND_LABEL } from "@/lib/payment-proofs";

export const dynamic = "force-dynamic";

const fileUrl = (key: string) => `/api/admin/file?key=${encodeURIComponent(key)}`;
const when = (d: Date) => d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });

/** One bill: the uploaded receipt next to what was billed, with accept / reject. */
export default async function BillPage({ params }: { params: Promise<{ code: string }> }) {
  await requireAdmin();
  const { code } = await params;
  const inv = await prisma.invoice.findUnique({
    where: { code: decodeURIComponent(code).toUpperCase() },
    include: {
      proofs: { orderBy: { uploadedAt: "desc" } },
      payments: { orderBy: { paidAt: "desc" } },
      lease: { include: { tenant: true, room: { include: { roomType: true } } } },
      application: { include: { room: { include: { roomType: true } } } },
      guestStay: { include: { tenant: true } },
    },
  });
  if (!inv) notFound();

  const state = billState(inv, inv.proofs, new Date());
  const pending = inv.proofs.find((p) => p.status === "SUBMITTED");
  const shownProof = pending ?? inv.proofs[0];
  const tenant = inv.lease?.tenant ?? inv.guestStay?.tenant ?? null;
  const app = inv.application;
  const payer = tenant?.fullName ?? app?.fullName ?? "-";
  const phone = tenant?.phoneE164 ?? app?.phoneE164 ?? null;
  const maskedPhone = phone ? `${phone.slice(0, 6)}••••${phone.slice(-3)}` : "-";

  return (
    <>
      <a className="crumb" href="/admin/tagihan">← Tagihan</a>
      <div className="panel">
        <div className="h">
          <b>{pending ? "Cek bukti" : "Tagihan"} · {inv.code}</b>
          <span>{KIND_LABEL[inv.kind]} · {payer}</span>
        </div>
        <div className="verify">
          {shownProof ? (
            <a className="proof" href={fileUrl(shownProof.fileKey)} target="_blank" rel="noreferrer" title="Buka ukuran penuh">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileUrl(shownProof.fileKey)} alt={`Bukti transfer ${inv.code}`} />
            </a>
          ) : (
            <div className="proof" style={{ display: "grid", placeItems: "center", color: "var(--ink2)" }}>Belum ada bukti transfer</div>
          )}
          <div>
            <div className="kv">
              <div><span>Jenis</span><b>{KIND_LABEL[inv.kind]}</b></div>
              <div><span>Untuk</span>{inv.description}</div>
              <div><span>Tagihan</span>{rp(inv.amount)}{inv.amountPaid > 0 && inv.amountPaid < inv.amount ? ` · sisa ${rp(inv.amount - inv.amountPaid)}` : ""}</div>
              <div><span>Jatuh tempo</span>{niceDate(inv.dueDate)}{state === "late" ? ` · terlambat ${daysLate(inv.dueDate)} hari` : ""}</div>
              <div><span>Penyewa</span>{payer} · {maskedPhone}{tenant ? ` · ${tenant.accountCode}` : ""}</div>
              {inv.lease && <div><span>Kamar</span>{inv.lease.room.code} · {inv.lease.room.roomType.name}</div>}
              {!inv.lease && app && (
                <div><span>Pendaftaran</span>{app.reference} · {app.room.roomType.name}{app.moveInDate ? ` · masuk ${niceDate(app.moveInDate)}` : ""}</div>
              )}
              {pending && <div><span>Bukti dikirim</span>{when(pending.uploadedAt)}</div>}
              {inv.payments[0] && <div><span>Dibayar</span>{rp(inv.payments[0].amount)} · {inv.payments[0].method} · {when(inv.payments[0].paidAt)}</div>}
            </div>

            {pending ? (
              <div className="actions">
                <form method="post" action="/api/admin/bukti">
                  <input type="hidden" name="proofId" value={pending.id} />
                  <input type="hidden" name="decision" value="accept" />
                  <button className="btn pri" type="submit">Terima pembayaran</button>
                </form>
                <form method="post" action="/api/admin/bukti" className="reject">
                  <input type="hidden" name="proofId" value={pending.id} />
                  <input type="hidden" name="decision" value="reject" />
                  <input name="reason" maxLength={300} required placeholder="Alasan ditolak, mis. nominal kurang Rp50.000" aria-label="Alasan ditolak" />
                  <button className="btn bad" type="submit">Tolak + kirim alasan</button>
                </form>
              </div>
            ) : (
              <p className="mute" style={{ marginTop: 14 }}>
                {state === "paid" ? "Tagihan ini sudah lunas." : "Menunggu penyewa mengirim bukti transfer."}
              </p>
            )}
            {inv.kind === "DEPOSIT" && pending && (
              <p className="mute small" style={{ marginTop: 10 }}>
                Terima → akun penghuni dibuat, kamar disiapkan, tagihan sewa bulan pertama dibuat, dan calon penghuni dapat link buat akun.
              </p>
            )}

            {inv.proofs.filter((p) => p.status !== "SUBMITTED").length > 0 && (
              <div className="history">
                <b style={{ color: "var(--ink)", fontWeight: 500 }}>Riwayat bukti</b>
                {inv.proofs.filter((p) => p.status !== "SUBMITTED").map((p) => (
                  <div key={p.id}>
                    {when(p.uploadedAt)} · {p.status === "ACCEPTED" ? "diterima" : `ditolak: ${p.rejectReason ?? "-"}`}
                    {p.reviewedBy ? ` · oleh ${p.reviewedBy}` : ""} · <a href={fileUrl(p.fileKey)} target="_blank" rel="noreferrer">lihat</a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

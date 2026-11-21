import { ApplicationStatus, InvoiceKind, InvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findApplicationByUploadToken } from "@/lib/application";
import { rp } from "@/lib/money";
import FlowShell from "@/components/site/FlowShell";
import ProofUpload from "@/components/site/ProofUpload";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kirim bukti transfer", robots: { index: false, follow: false } };

/** The link the assistant sends with the bank details: upload the deposit transfer proof. */
export default async function ProofPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ ok?: string }> }) {
  const { token } = await params;
  const { ok } = await searchParams;
  const app = await findApplicationByUploadToken(token);
  const invoice = app
    ? await prisma.invoice.findFirst({
        where: { applicationId: app.id, kind: InvoiceKind.DEPOSIT, status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL] } },
      })
    : null;

  if (ok || app?.status === ApplicationStatus.PROOF_SUBMITTED) {
    return (
      <FlowShell>
        <div className="center">
          <div className="done-mark wait">…</div>
          <h1 style={{ fontSize: "clamp(28px,3.6vw,40px)", marginBottom: 12 }}>Pembayaran sedang diverifikasi</h1>
          <p>
            Bukti transfer sudah kami terima. Pengecekan memakan waktu <b>1–2 hari kerja</b>. Kakak akan dapat pesan
            WhatsApp begitu pembayaran terverifikasi, berisi link untuk membuat akun penghuni.
          </p>
        </div>
      </FlowShell>
    );
  }
  if (!app || !invoice || app.status !== ApplicationStatus.AWAITING_PAYMENT) {
    return (
      <FlowShell>
        <div className="center">
          <div className="done-mark bad">!</div>
          <h1 style={{ fontSize: "clamp(28px,3.6vw,40px)", marginBottom: 12 }}>Link sudah tidak berlaku</h1>
          <p>Minta link baru ke asisten kami lewat chat ya kak.</p>
        </div>
      </FlowShell>
    );
  }

  return (
    <FlowShell>
      <div className="flow-head">
        <div className="lbl">{app.reference} · {invoice.code}</div>
        <h1>Kirim bukti transfer</h1>
        <p>Deposit {app.room.roomType.name} · {rp(invoice.amount - invoice.amountPaid)}</p>
      </div>
      <ProofUpload action="/api/apply/proof" fields={{ upload: token }} doneHref={`/bukti/${token}?ok=1`} />
    </FlowShell>
  );
}

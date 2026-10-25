import { InvoiceKind, InvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import FlowShell from "@/components/site/FlowShell";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/**
 * Where Xendit sends the payer after checkout. The last step of the flow:
 * it points them back to the chat, where the confirmation arrives.
 * The status shown comes from our own database, never from the URL.
 */
export default async function PaidPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const invoice = /^[A-Z0-9-]{6,40}$/i.test(code)
    ? await prisma.invoice.findUnique({ where: { code: code.toUpperCase() }, select: { code: true, status: true, kind: true } })
    : null;

  const paid = invoice?.status === InvoiceStatus.PAID;
  // A new renter who signed up on the website may never have used the chat.
  const newRenter = paid && invoice?.kind === InvoiceKind.ONBOARDING;
  const chatLink = "/?chat=1";

  return (
    <FlowShell>
      <div className="center">
        <div className={paid ? "done-mark" : "done-mark wait"}>{paid ? "✓" : "…"}</div>
        <div className="lbl">{paid ? "Pembayaran diterima" : "Pembayaran sedang diproses"}</div>
        <h1 style={{ fontSize: "clamp(30px,4vw,44px)", margin: "12px 0 18px" }}>
          {paid ? "Terima kasih." : "Mohon tunggu sebentar."}
        </h1>
        <p>
          {paid
            ? `Terima kasih kak. Konfirmasi untuk ${invoice!.code} sudah kami kirim ke chat.`
            : "Biasanya hanya beberapa detik. Konfirmasi akan masuk ke chat begitu pembayaran tercatat."}
        </p>
        {newRenter ? (
          <>
            <div className="actions">
              <a className="btn pri" href="/masuk">Masuk ke akun penghuni</a>
              <a className="btn" href={chatLink}>Kembali ke chat</a>
            </div>
            <p style={{ color: "var(--ink-3)", fontSize: 14 }}>Masuk pakai nomor HP dan password yang tadi kakak buat.</p>
          </>
        ) : (
          <div className="actions">
            <a className="btn pri" href={chatLink}>Kembali ke chat</a>
          </div>
        )}
      </div>
    </FlowShell>
  );
}

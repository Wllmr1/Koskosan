import { InvoiceKind, InvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div className="card" style={{ padding: "40px 28px", textAlign: "center", width: "min(420px,100%)" }}>
        <div
          style={{
            width: 62, height: 62, borderRadius: "50%", display: "grid", placeItems: "center",
            margin: "0 auto 16px", fontSize: 28,
            background: paid ? "var(--ok-soft)" : "var(--gold-soft)",
            color: paid ? "var(--ok)" : "var(--gold)",
          }}
        >
          {paid ? "✓" : "…"}
        </div>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>{paid ? "Pembayaran diterima" : "Pembayaran sedang diproses"}</h1>
        <p className="muted" style={{ marginBottom: 22 }}>
          {paid
            ? `Terima kasih kak. Konfirmasi untuk ${invoice!.code} sudah kami kirim ke chat.`
            : "Biasanya hanya beberapa detik. Konfirmasi akan masuk ke chat begitu pembayaran tercatat."}
        </p>
        {newRenter ? (
          <div style={{ display: "grid", gap: 10 }}>
            <a className="btn btn-pri" href="/masuk">Masuk ke akun penghuni</a>
            <a className="btn" href={chatLink}>Kembali ke chat</a>
            <p className="small muted" style={{ margin: 0 }}>Masuk pakai nomor HP dan password yang tadi kakak buat.</p>
          </div>
        ) : (
          <a className="btn btn-pri" href={chatLink} style={{ width: "100%" }}>
            Kembali ke chat
          </a>
        )}
      </div>
    </main>
  );
}

import { InvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { botChatLink } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/**
 * Where Xendit sends the payer after checkout. The last step of the flow:
 * it points them back to the WhatsApp chat, where the confirmation arrives.
 * The status shown comes from our own database, never from the URL.
 */
export default async function PaidPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const invoice = /^[A-Z0-9-]{6,40}$/i.test(code)
    ? await prisma.invoice.findUnique({ where: { code: code.toUpperCase() }, select: { code: true, status: true } })
    : null;

  const paid = invoice?.status === InvoiceStatus.PAID;
  const chatLink = botChatLink(invoice ? `Halo, saya sudah bayar ${invoice.code}` : "Halo");

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
            ? `Terima kasih kak. Konfirmasi untuk ${invoice!.code} sudah kami kirim lewat WhatsApp.`
            : "Biasanya hanya beberapa detik. Konfirmasi akan masuk ke WhatsApp kakak begitu pembayaran tercatat."}
        </p>
        <a className="btn btn-pri" href={chatLink} style={{ width: "100%" }}>
          Kembali ke chat WhatsApp
        </a>
      </div>
    </main>
  );
}

import { notFound } from "next/navigation";
import { InvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fakePaymentsAllowed } from "@/lib/features";
import { rp } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Development stand-in for Xendit's checkout. 404 in production or when Xendit is set up. */
export default async function FakePayPage({ params }: { params: Promise<{ code: string }> }) {
  if (!fakePaymentsAllowed()) notFound();
  const { code } = await params;
  if (!/^[A-Z0-9-]{6,40}$/i.test(code)) notFound();
  const invoice = await prisma.invoice.findUnique({ where: { code: code.toUpperCase() } });
  if (!invoice) notFound();

  const remaining = invoice.amount - invoice.amountPaid;
  const paid = invoice.status === InvoiceStatus.PAID;

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div className="card" style={{ padding: "32px 26px", width: "min(440px,100%)" }}>
        <span className="pill pill-warn">Mode uji — bukan pembayaran sungguhan</span>
        <h1 style={{ fontSize: 20, margin: "14px 0 6px" }}>{invoice.description}</h1>
        <p className="muted small" style={{ margin: 0 }}>
          {invoice.code} · status {invoice.status.toLowerCase()}
        </p>
        <p style={{ fontSize: 28, fontWeight: 700, margin: "18px 0" }}>{rp(remaining)}</p>
        {paid ? (
          <a className="btn btn-pri" href={`/paid/${invoice.code}`} style={{ width: "100%", textAlign: "center" }}>
            Sudah lunas — lihat konfirmasi
          </a>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <form method="post" action="/api/dev/pay">
              <input type="hidden" name="code" value={invoice.code} />
              <input type="hidden" name="outcome" value="pay" />
              <button className="btn btn-pri" type="submit" style={{ width: "100%" }}>
                Simulasikan bayar {rp(remaining)}
              </button>
            </form>
            <form method="post" action="/api/dev/pay">
              <input type="hidden" name="code" value={invoice.code} />
              <input type="hidden" name="outcome" value="expire" />
              <button className="btn" type="submit" style={{ width: "100%" }}>
                Simulasikan kedaluwarsa
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}

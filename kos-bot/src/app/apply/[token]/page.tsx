import { ApplicationStatus, InvoiceKind, ProofStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findApplicationByToken, termLabel, termsInputFor } from "@/lib/application";
import { termsClauses, termsHash } from "@/lib/terms";
import { niceDate, rp } from "@/lib/money";
import { botChatLink } from "@/lib/whatsapp";
import { depositPayText } from "@/lib/pay-text";
import FlowShell from "@/components/site/FlowShell";
import ApplyFlow from "./ApplyFlow";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/**
 * The secure page the chat links to. Everything personal happens here, behind
 * a single-use token, and never in WhatsApp: details, the Terms & Conditions,
 * then the deposit (bank transfer + proof upload, checked by the owner).
 */
export default async function ApplyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const app = await findApplicationByToken(token);
  if (!app) return <Expired />;

  const settings = await prisma.propertySetting.findUniqueOrThrow({ where: { id: "default" } });

  if (app.status === ApplicationStatus.COMPLETED) {
    return (
      <FlowShell>
        <Done title="Pendaftaran selesai" message="Kontrak sudah ditandatangani. Selamat datang! Detail kamar dan tagihan ada di akun penghuni." />
        <p style={{ textAlign: "center" }}><a className="btn pri" href="/masuk">Masuk</a></p>
      </FlowShell>
    );
  }
  if (app.status === ApplicationStatus.VERIFIED) {
    const tenant = app.phoneE164 ? await prisma.tenant.findUnique({ where: { phoneE164: app.phoneE164 } }) : null;
    return (
      <FlowShell>
        <Done
          title="Deposit terverifikasi"
          message={
            tenant?.passwordHash
              ? "Pembayaran deposit sudah kami terima. Masuk ke akun penghuni untuk lihat detail kamar dan tagihan sewa bulan pertama."
              : "Pembayaran deposit sudah kami terima. Buat akun penghuni untuk lihat detail kamar dan tagihan sewa bulan pertama."
          }
        />
        <div style={{ textAlign: "center" }}>
          {tenant?.passwordHash ? (
            <a className="btn pri" href="/masuk">Masuk</a>
          ) : (
            <form method="post" action="/api/apply/account">
              <input type="hidden" name="token" value={token} />
              <button className="btn pri" type="submit">Buat akun</button>
            </form>
          )}
        </div>
      </FlowShell>
    );
  }
  if (app.status === ApplicationStatus.NEEDS_REVIEW) {
    return (
      <FlowShell>
        <Done title="Sedang dicek pemilik kos" message="Nomor HP yang kakak isi sudah terdaftar di akun lain, jadi pemilik kos akan menghubungi kakak dulu sebelum lanjut." />
      </FlowShell>
    );
  }

  const deposit = await prisma.invoice.findFirst({
    where: { applicationId: app.id, kind: InvoiceKind.DEPOSIT },
    include: { proofs: { orderBy: { uploadedAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
  });
  const lastProof = deposit?.proofs[0];

  const step =
    app.status === ApplicationStatus.PROOF_SUBMITTED
      ? 5
      : app.status === ApplicationStatus.AWAITING_PAYMENT && deposit
        ? 3
        : app.idNumberEnc
          ? 2
          : 1;

  // Built by the same function the hash check uses, so the wording on screen is exactly what gets agreed.
  const terms = termsInputFor(app, settings);
  const payText = deposit ? depositPayText(app.reference, deposit.code) : "";

  return (
    <FlowShell>
      <ApplyFlow
        token={token}
        propertyName={settings.name}
        reference={app.reference}
        room={{
          type: app.room.roomType.name,
          size: app.room.roomType.sizeLabel,
          price: rp(app.room.roomType.monthlyPrice),
        }}
        moveIn={{
          min:
            app.room.status === "OCCUPIED" && app.room.availableOn
              ? app.room.availableOn.toISOString().slice(0, 10)
              : new Date().toISOString().slice(0, 10),
          value: app.moveInDate ? app.moveInDate.toISOString().slice(0, 10) : undefined,
        }}
        contract={`Kontrak ${termLabel(app, settings.minMonths)}`}
        startStep={step}
        deposit={
          deposit
            ? {
                amount: rp(deposit.amount),
                invoice: deposit.code,
                due: niceDate(deposit.dueDate),
                rejected: lastProof?.status === ProofStatus.REJECTED ? lastProof.rejectReason ?? undefined : undefined,
              }
            : null
        }
        payLink={deposit ? botChatLink(payText) : null}
        payText={payText}
        clauses={step === 2 ? termsClauses(terms) : []}
        termsHash={termsHash(terms)}
      />
    </FlowShell>
  );
}

function Expired() {
  return (
    <FlowShell>
      <div className="center">
        <div className="done-mark bad">!</div>
        <h1 style={{ fontSize: "clamp(30px,4vw,44px)", marginBottom: 12 }}>Link sudah tidak berlaku</h1>
        <p>Link pendaftaran berlaku 48 jam, dan deposit perlu dibayar dalam 3 hari. Minta link baru lewat chat ya kak.</p>
      </div>
    </FlowShell>
  );
}

function Done({ title, message }: { title: string; message: string }) {
  return (
    <div className="center">
      <div className="done-mark">✓</div>
      <h1 style={{ fontSize: "clamp(30px,4vw,44px)", marginBottom: 12 }}>{title}</h1>
      <p>{message}</p>
    </div>
  );
}

import { ApplicationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildContractData, findApplicationByToken, onboardingAmount } from "@/lib/application";
import { contractClauses, contractHash } from "@/lib/contract";
import { decrypt } from "@/lib/crypto";
import { rp } from "@/lib/money";
import ApplyFlow from "./ApplyFlow";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/**
 * The secure page the chat links to. Everything personal happens here, behind
 * a single-use token, and never in WhatsApp.
 */
export default async function ApplyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const app = await findApplicationByToken(token);
  if (!app) return <Expired />;

  const settings = await prisma.propertySetting.findUniqueOrThrow({ where: { id: "default" } });

  if (app.status === ApplicationStatus.COMPLETED) {
    return (
      <Shell>
        <Done title="Pendaftaran selesai" message={`Kamar ${app.room.code} sudah resmi jadi milik kakak. Konfirmasinya sudah ada di chat.`} />
      </Shell>
    );
  }

  const amount = onboardingAmount(app.room.monthlyPrice, app.plan, settings.yearlyMonths, settings.depositMonths);
  const rentMonths = app.plan === "YEARLY" ? settings.yearlyMonths : 1;

  // Built by the same function as the signed PDF, so the wording on screen is
  // exactly what gets signed and hashed. Only masked ID digits reach the page.
  // Before step 1 there are no details yet, so no contract is shown.
  const contract = app.idNumberEnc ? await buildContractData(app.id, decrypt(app.idNumberEnc)) : null;
  const clauses = contract ? contractClauses(contract) : [];

  return (
    <Shell>
      <ApplyFlow
        token={token}
        propertyName={settings.name}
        reference={app.reference}
        room={{
          code: app.room.code,
          type: app.room.type,
          size: app.room.sizeLabel,
          price: rp(app.room.monthlyPrice),
        }}
        plan={app.plan === "YEARLY" ? "tahunan" : "bulanan"}
        startStep={clauses.length ? 2 : 1}
        contractHash={contract ? contractHash(contract) : ""}
        summary={{
          rentLabel: app.plan === "YEARLY" ? `Sewa ${rentMonths} bulan (tahunan)` : "Sewa bulan pertama",
          rentAmount: rp(app.room.monthlyPrice * rentMonths),
          depositAmount: rp(app.room.monthlyPrice * settings.depositMonths),
          total: rp(amount),
        }}
        clauses={clauses}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "start center", padding: "28px 16px 56px" }}>
      <div style={{ width: "min(640px,100%)" }}>{children}</div>
    </main>
  );
}

function Expired() {
  return (
    <Shell>
      <div className="card" style={{ padding: "40px 28px", textAlign: "center" }}>
        <div
          style={{
            width: 62,
            height: 62,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            margin: "0 auto 16px",
            background: "var(--bad-soft)",
            color: "var(--bad)",
            fontSize: 28,
          }}
        >
          !
        </div>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Link sudah tidak berlaku</h1>
        <p className="muted">Link pendaftaran berlaku 48 jam. Minta link baru lewat WhatsApp ya kak.</p>
      </div>
    </Shell>
  );
}

function Done({ title, message }: { title: string; message: string }) {
  return (
    <div className="card" style={{ padding: "40px 28px", textAlign: "center" }}>
      <div
        style={{
          width: 62,
          height: 62,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          margin: "0 auto 16px",
          background: "var(--ok-soft)",
          color: "var(--ok)",
          fontSize: 28,
        }}
      >
        ✓
      </div>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>{title}</h1>
      <p className="muted">{message}</p>
    </div>
  );
}

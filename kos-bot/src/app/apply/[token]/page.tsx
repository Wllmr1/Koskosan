import { ApplicationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildContractData, findApplicationByToken, onboardingAmount } from "@/lib/application";
import { contractClauses, contractHash } from "@/lib/contract";
import { decrypt } from "@/lib/crypto";
import { rp } from "@/lib/money";
import FlowShell from "@/components/site/FlowShell";
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

  const amount = onboardingAmount(app.room.roomType.monthlyPrice, app.plan, settings.yearlyMonths, settings.depositMonths);
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
        plan={app.plan === "YEARLY" ? "tahunan" : "bulanan"}
        startStep={clauses.length ? 2 : 1}
        contractHash={contract ? contractHash(contract) : ""}
        summary={{
          rentLabel: app.plan === "YEARLY" ? `Sewa ${rentMonths} bulan (tahunan)` : "Sewa bulan pertama",
          rentAmount: rp(app.room.roomType.monthlyPrice * rentMonths),
          depositAmount: rp(app.room.roomType.monthlyPrice * settings.depositMonths),
          total: rp(amount),
        }}
        clauses={clauses}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <FlowShell>{children}</FlowShell>;
}

function Expired() {
  return (
    <Shell>
      <div className="center">
        <div className="done-mark bad">!</div>
        <h1 style={{ fontSize: "clamp(30px,4vw,44px)", marginBottom: 12 }}>Link sudah tidak berlaku</h1>
        <p>Link pendaftaran berlaku 48 jam. Minta link baru lewat WhatsApp ya kak.</p>
      </div>
    </Shell>
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

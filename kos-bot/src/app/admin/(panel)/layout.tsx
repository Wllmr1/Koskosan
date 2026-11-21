import { InvoiceStatus, ProofStatus, TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import PanelFrame from "@/components/admin/PanelFrame";
import "./admin.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard", robots: { index: false, follow: false } };

/** Every logged-in dashboard page: sidebar menu + top bar, in the agreed black-and-white design. */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const who = await requireAdmin();
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const [proofs, late, urgent] = await Promise.all([
    prisma.paymentProof.count({ where: { status: ProofStatus.SUBMITTED } }),
    prisma.invoice.count({
      where: {
        status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL] },
        dueDate: { lt: today },
        leaseId: { not: null },
        proofs: { none: { status: ProofStatus.SUBMITTED } },
      },
    }),
    prisma.ticket.count({ where: { status: { not: TicketStatus.RESOLVED }, urgency: "darurat" } }),
  ]);
  const settings = await prisma.propertySetting.findUnique({ where: { id: "default" }, select: { name: true } });

  return (
    <PanelFrame
      brand={settings?.name ?? "Dashboard"}
      who={who.name}
      isOwner={who.isOwner}
      counts={{ tagihan: proofs, terlambat: late, keluhan: urgent }}
    >
      {children}
    </PanelFrame>
  );
}

/**
 * Removes the demo seed's fake renters (Penghuni Demo N, account codes DEMO-…)
 * and frees the rooms they occupied. Real renters are never touched. Safe to
 * run more than once. Run with: npm run db:demo:clear
 */
import { clearDemoData } from "../src/lib/demo";
import { prisma } from "../src/lib/prisma";

async function main() {
  const r = await clearDemoData();
  if (r.tenants.length === 0 && r.roomsFreed.length === 0) {
    console.log("No demo renters found — nothing removed.");
    return;
  }
  console.log(`Removed ${r.tenants.length} demo renter(s): ${r.tenants.join(", ") || "-"}`);
  console.log(
    `  ${r.leases} lease(s), ${r.invoices} invoice(s), ${r.payments} payment(s), ${r.meterRows} meter row(s), ` +
      `${r.guestStays} guest stay(s), ${r.tickets} complaint(s), ${r.contacts} chat contact(s)`
  );
  console.log(`Rooms now available: ${r.roomsFreed.join(", ") || "-"}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

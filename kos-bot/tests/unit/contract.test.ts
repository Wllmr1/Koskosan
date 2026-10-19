import { LeasePlan } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { contractClauses, contractHash, type ContractData } from "@/lib/contract";
import { onboardingAmount } from "@/lib/application";

const data: ContractData = {
  propertyName: "Kos Test",
  propertyAddress: "Jl. Test 1",
  reference: "APP-1",
  tenantName: "Budi Santoso",
  tenantPhone: "+6281200000001",
  tenantIdNumber: "3201000000000001",
  roomCode: "A-101",
  roomType: "Standard",
  roomSize: "3 × 3 m",
  plan: LeasePlan.MONTHLY,
  monthlyRent: 1_350_000,
  deposit: 1_350_000,
  startDate: new Date("2026-11-01"),
  endDate: new Date("2027-02-01"),
  termLabel: "3 bulan (minimum)",
  lateFeePerDay: 25_000,
  lateFeeMax: 250_000,
  dueDay: 5,
  electricQuota: 100,
  electricRate: 1_700,
  guestFee: 50_000,
  houseRules: ["Tidak merokok"],
  yearlyMonths: 11,
  depositReturnDays: 14,
  utilitiesNote: "Air dan wifi termasuk, tanpa batas",
  maxGuestNights: 3,
};

describe("contract", () => {
  it("states the deposit return days, utilities and guest nights from data", () => {
    const text = contractClauses({ ...data, depositReturnDays: 21, maxGuestNights: 2, utilitiesNote: "Air termasuk" })
      .map((c) => c.body)
      .join("\n");
    expect(text).toContain("paling lambat 21 hari");
    expect(text).toContain("maksimal 2 malam");
    expect(text).toContain("Air termasuk");
  });

  it("any change to the terms changes the hash", () => {
    expect(contractHash({ ...data, depositReturnDays: 21 })).not.toBe(contractHash(data));
    expect(contractHash({ ...data, monthlyRent: 1_400_000 })).not.toBe(contractHash(data));
  });

  it("first payment = rent for the period + deposit months", () => {
    expect(onboardingAmount(1_000_000, LeasePlan.MONTHLY, 11, 1)).toBe(2_000_000);
    expect(onboardingAmount(1_000_000, LeasePlan.MONTHLY, 11, 2)).toBe(3_000_000);
    expect(onboardingAmount(1_000_000, LeasePlan.YEARLY, 11, 1)).toBe(12_000_000);
    expect(onboardingAmount(1_000_000, LeasePlan.MONTHLY, 11, 0)).toBe(1_000_000);
  });
});

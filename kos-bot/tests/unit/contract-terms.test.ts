import { describe, expect, it } from "vitest";
import { CONTRACT_MONTHS, contractLabel, parseContractMonths } from "@/lib/contract-terms";

describe("contract lengths", () => {
  it("offers 6 months, 1 year and 2 years", () => {
    expect([...CONTRACT_MONTHS]).toEqual([6, 12, 24]);
    expect(CONTRACT_MONTHS.map(contractLabel)).toEqual(["6 bulan", "1 tahun", "2 tahun"]);
  });

  it("labels any other number in months", () => {
    expect(contractLabel(3)).toBe("3 bulan");
    expect(contractLabel(18)).toBe("18 bulan");
  });

  it("parses only the three lengths, from numbers or form strings", () => {
    expect(parseContractMonths(12)).toBe(12);
    expect(parseContractMonths("24")).toBe(24);
    expect(parseContractMonths("6")).toBe(6);
    for (const bad of ["", "06", "012", "3", "13", "bulanan", "tahunan", "12.0", " 12", null, undefined, 7, NaN, {}]) {
      expect(parseContractMonths(bad)).toBeNull();
    }
  });
});

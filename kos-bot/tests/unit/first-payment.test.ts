import { describe, expect, it } from "vitest";
import { firstPayment } from "@/lib/money";

describe("firstPayment", () => {
  it("adds the deposit to the first month's rent", () => {
    expect(firstPayment(1_500_000, 1)).toEqual({ rent: 1_500_000, deposit: 1_500_000, total: 3_000_000 });
  });

  it("scales the deposit by its months, and allows none", () => {
    expect(firstPayment(1_000_000, 2).deposit).toBe(2_000_000);
    expect(firstPayment(2_000_000, 0).total).toBe(2_000_000);
  });
});

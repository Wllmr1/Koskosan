import { describe, expect, it } from "vitest";
import { parseListItem, parseProperty, parseRoom } from "@/lib/admin-forms";

function form(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

const property = {
  name: "Kos Test",
  tagline: "Dekat kampus",
  address: "Jl. Test No. 1",
  mapsUrl: "",
  guestFeePerNight: "50000",
  lateFeePerDay: "25000",
  lateFeeMax: "250000",
  electricQuota: "100",
  electricRate: "1700",
  dueDayOfMonth: "5",
  yearlyMonths: "11",
  minMonths: "3",
  guestCutoffHour: "21",
  maxGuestNights: "3",
  maxGuestsAtOnce: "2",
  depositMonths: "1",
  depositReturnDays: "14",
  utilitiesNote: "Air dan wifi termasuk",
  houseRules: "Tidak merokok\n\n  Jam tenang 22.00  \n",
  paymentTerms: "Bayar tanggal 5",
  guestRules: "Daftar dulu",
  facilities: "Wifi",
};

describe("admin forms", () => {
  it("parses property settings and splits lists by line", () => {
    const r = parseProperty(form(property));
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.houseRules).toEqual(["Tidak merokok", "Jam tenang 22.00"]);
      expect(r.data.guestFeePerNight).toBe(50000);
    }
  });

  it("rejects non-https map links such as javascript:", () => {
    expect(parseProperty(form({ ...property, mapsUrl: "javascript:alert(1)" })).success).toBe(false);
    expect(parseProperty(form({ ...property, mapsUrl: "https://maps.app.goo.gl/abc" })).success).toBe(true);
  });

  it("rejects out-of-range numbers", () => {
    expect(parseProperty(form({ ...property, dueDayOfMonth: "31" })).success).toBe(false);
  });

  const room = {
    code: "d-401",
    type: "Deluxe",
    floor: "4",
    sizeLabel: "3 × 4 m",
    monthlyPrice: "1900000",
    bathroom: "Dalam",
    extras: "AC",
    description: "",
    status: "AVAILABLE",
    availableOn: "",
    sortOrder: "9",
  };

  it("uppercases room codes and reads the hidden checkbox", () => {
    const r = parseRoom(form(room));
    expect(r.success && r.data.code).toBe("D-401");
    expect(r.success && r.data.hidden).toBe(false);
    const hidden = parseRoom(form({ ...room, hidden: "on" }));
    expect(hidden.success && hidden.data.hidden).toBe(true);
    expect(parseRoom(form({ ...room, code: "D 401!" })).success).toBe(false);
  });

  it("list items need both fields", () => {
    expect(parseListItem(form({ a: "Laundry", b: "Rp90.000/bulan" })).success).toBe(true);
    expect(parseListItem(form({ a: "", b: "x" })).success).toBe(false);
  });
});

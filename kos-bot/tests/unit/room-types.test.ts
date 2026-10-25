import { describe, expect, it } from "vitest";
import { availabilityLabel, availabilityOf, notBeforeToday, tagsOf } from "@/lib/room-types";
import { niceDate } from "@/lib/money";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("availabilityOf", () => {
  it("counts free rooms and finds the earliest date a full one opens", () => {
    expect(
      availabilityOf([
        { status: "AVAILABLE", availableOn: null, hidden: false },
        { status: "OCCUPIED", availableOn: d("2027-01-15"), hidden: false },
      ]),
    ).toEqual({ free: 1, nextFree: d("2027-01-15") });
  });
  it("ignores hidden rooms", () => {
    expect(availabilityOf([{ status: "AVAILABLE", availableOn: null, hidden: true }]).free).toBe(0);
  });
  it("ignores maintenance rooms for nextFree", () => {
    expect(availabilityOf([{ status: "MAINTENANCE", availableOn: d("2026-12-01"), hidden: false }]).nextFree).toBeNull();
  });
  it("picks the earliest of several dates", () => {
    const a = availabilityOf([
      { status: "OCCUPIED", availableOn: d("2027-03-01"), hidden: false },
      { status: "OCCUPIED", availableOn: d("2027-02-01"), hidden: false },
    ]);
    expect(a.nextFree).toEqual(d("2027-02-01"));
  });
  it("ignores booked rooms for nextFree — the rent flow cannot book them ahead", () => {
    const a = availabilityOf([
      { status: "OCCUPIED", availableOn: d("2027-03-01"), hidden: false },
      { status: "BOOKED", availableOn: d("2027-02-01"), hidden: false },
    ]);
    expect(a.nextFree).toEqual(d("2027-03-01"));
    expect(availabilityOf([{ status: "BOOKED", availableOn: d("2027-02-01"), hidden: false }]).nextFree).toBeNull();
  });
  it("never gives a date in the past: a passed leaving date reads as today", () => {
    const now = new Date("2026-10-25T09:30:00Z");
    expect(availabilityOf([{ status: "OCCUPIED", availableOn: d("2026-09-01"), hidden: false }], now).nextFree).toEqual(d("2026-10-25"));
  });
});

describe("availabilityLabel", () => {
  it("says how many rooms are free", () => {
    expect(availabilityLabel({ free: 2, nextFree: null })).toBe("2 kamar tersedia");
  });
  it("gives the date when full", () => {
    expect(availabilityLabel({ free: 0, nextFree: d("2027-01-15") })).toBe(`Penuh · kosong mulai ${niceDate(d("2027-01-15"))}`);
  });
  it("shows a past date as today", () => {
    const now = new Date("2026-10-25T09:30:00Z");
    expect(availabilityLabel({ free: 0, nextFree: d("2026-09-01") }, now)).toBe(`Penuh · kosong mulai ${niceDate(d("2026-10-25"))}`);
  });
  it("just says full with no date", () => {
    expect(availabilityLabel({ free: 0, nextFree: null })).toBe("Penuh");
  });
});

describe("notBeforeToday", () => {
  const now = new Date("2026-10-25T23:59:00Z");
  it("moves a past date up to today", () => {
    expect(notBeforeToday(d("2026-10-24"), now)).toEqual(d("2026-10-25"));
  });
  it("leaves today and later dates alone", () => {
    expect(notBeforeToday(d("2026-10-25"), now)).toEqual(d("2026-10-25"));
    expect(notBeforeToday(d("2027-01-15"), now)).toEqual(d("2027-01-15"));
  });
});

describe("tagsOf", () => {
  it("lists every tag in order", () => {
    expect(tagsOf({ isNew: true, isVip: true, hasEnsuite: true })).toEqual(["Kos baru", "VIP", "Kamar mandi dalam"]);
  });
  it("falls back to Kos lama", () => {
    expect(tagsOf({ isNew: false, isVip: false, hasEnsuite: false })).toEqual(["Kos lama"]);
  });
});

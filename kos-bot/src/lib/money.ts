/** Rupiah helpers. Amounts are always integers — never floats. */
export const rp = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");

export const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);

/** "Now" in Jakarta time (WIB, UTC+7), as a plain shifted Date for formatting. */
export function wibNow() {
  const d = new Date(Date.now() + 7 * 3600_000);
  return {
    iso: d.toISOString(),
    date: d.toISOString().slice(0, 10),
    hour: d.getUTCHours(),
    time: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
    weekday: ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"][d.getUTCDay()],
  };
}

export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function addMonths(date: Date, n: number) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d;
}

export const firstOfMonth = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

export function niceDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(`${d}T00:00:00Z`) : d;
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Turn any Indonesian phone spelling into +62… E.164. */
export function normalizePhone(input: string): string | null {
  const digits = String(input).replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  let d = digits.startsWith("+") ? digits.slice(1) : digits;
  if (d.startsWith("0")) d = "62" + d.slice(1);
  if (d.startsWith("8")) d = "62" + d;
  if (!/^\d{9,15}$/.test(d)) return null;
  return "+" + d;
}

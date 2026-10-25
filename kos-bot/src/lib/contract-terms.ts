/** The contract lengths a renter can choose, in months. The one list every page, form and the bot use. */
export const CONTRACT_MONTHS = [6, 12, 24] as const;
export type ContractMonths = (typeof CONTRACT_MONTHS)[number];

/** "6 bulan", "1 tahun", "2 tahun"; any other length reads in months. */
export function contractLabel(months: number): string {
  if (months === 12) return "1 tahun";
  if (months === 24) return "2 tahun";
  return `${months} bulan`;
}

/** A chosen length from a form field or tool input: exactly 6, 12 or 24, else null. */
export function parseContractMonths(value: unknown): ContractMonths | null {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d{1,2}$/.test(value) ? Number(value) : NaN;
  return CONTRACT_MONTHS.find((m) => m === n) ?? null;
}

/** "6 bulan, 1 tahun, atau 2 tahun" — the offered lengths in a sentence. */
export function contractLengthsText(): string {
  const labels = CONTRACT_MONTHS.map(contractLabel);
  return `${labels.slice(0, -1).join(", ")}, atau ${labels[labels.length - 1]}`;
}

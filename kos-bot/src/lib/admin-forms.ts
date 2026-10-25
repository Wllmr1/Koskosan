import { RoomStatus } from "@prisma/client";
import { z, type ZodError } from "zod";

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const list = z.array(z.string().max(300)).max(40);
const lines = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

export const propertySchema = z.object({
  name: text(2, 80),
  tagline: text(2, 140),
  address: text(5, 200),
  // https only: the site renders this as a link, so javascript: and friends must never get in.
  mapsUrl: z.union([z.literal(""), z.string().trim().max(500).regex(/^https:\/\/[^\s"<>]+$/, "harus diawali https://")]),
  guestFeePerNight: int(0, 10_000_000),
  lateFeePerDay: int(0, 10_000_000),
  lateFeeMax: int(0, 100_000_000),
  electricQuota: int(0, 10_000),
  electricRate: int(0, 100_000),
  dueDayOfMonth: int(1, 28),
  yearlyMonths: int(1, 12),
  minMonths: int(1, 24),
  guestCutoffHour: int(0, 23),
  maxGuestNights: int(1, 30),
  maxGuestsAtOnce: int(1, 10),
  depositMonths: int(0, 6),
  depositReturnDays: int(0, 90),
  utilitiesNote: text(2, 200),
  houseRules: list,
  paymentTerms: list,
  guestRules: list,
  facilities: list,
});

export function parseProperty(form: FormData) {
  const raw: Record<string, unknown> = Object.fromEntries(form.entries());
  for (const key of ["houseRules", "paymentTerms", "guestRules", "facilities"]) raw[key] = lines(form.get(key));
  return propertySchema.safeParse(raw);
}

export const roomSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,12}$/, "huruf, angka, dan tanda - saja"),
  roomTypeId: z.string().min(1, "pilih tipe kamar"),
  floor: int(0, 50),
  status: z.nativeEnum(RoomStatus),
  availableOn: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  sortOrder: int(0, 999),
  hidden: z.boolean(),
});

export function parseRoom(form: FormData) {
  return roomSchema.safeParse({ ...Object.fromEntries(form.entries()), hidden: form.get("hidden") === "on" });
}

export const roomTypeSchema = z.object({
  name: text(2, 40),
  slug: z.string().trim().regex(/^[a-z0-9-]{2,40}$/, "huruf kecil, angka, dan tanda - saja"),
  sizeLabel: text(1, 40),
  monthlyPrice: int(100_000, 100_000_000),
  bathroom: text(2, 80),
  extras: z.string().trim().max(300),
  description: z.string().trim().max(1500),
  isNew: z.boolean(),
  isVip: z.boolean(),
  hasEnsuite: z.boolean(),
  sortOrder: int(0, 999),
});

export function parseRoomType(form: FormData) {
  const on = (k: string) => form.get(k) === "on";
  return roomTypeSchema.safeParse({
    ...Object.fromEntries(form.entries()),
    isNew: on("isNew"),
    isVip: on("isVip"),
    hasEnsuite: on("hasEnsuite"),
  });
}

export const listItemSchema = z.object({ a: text(1, 200), b: text(1, 1500) });

export function parseListItem(form: FormData) {
  return listItemSchema.safeParse({ a: form.get("a") ?? "", b: form.get("b") ?? "" });
}

/** Services, nearby places and FAQ share one editor: two text fields per row. */
export const LIST_KINDS = {
  layanan: { title: "Layanan berbayar", a: "Nama layanan", b: "Harga / keterangan" },
  sekitar: { title: "Sekitar kos", a: "Tempat", b: "Jarak" },
  faq: { title: "FAQ", a: "Pertanyaan", b: "Jawaban" },
} as const;
export type ListKind = keyof typeof LIST_KINDS;

export function firstIssue(error: ZodError): string {
  const issue = error.issues[0];
  return issue ? `${issue.path.join(".") || "form"}: ${issue.message}` : "Data tidak valid";
}

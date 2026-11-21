import type { PropertySetting } from "@prisma/client";
import { sha256 } from "./crypto";
import { niceDate, rp } from "./money";

export type TermsInput = {
  settings: PropertySetting;
  roomType: string;
  monthlyRent: number;
  deposit: number;
  startDate: Date;
  termLabel: string;
};

/**
 * The general Terms & Conditions a new renter ticks before paying the deposit.
 * The binding contract is signed on paper at move-in; this is what they agree
 * to now. Shown on screen and hashed, so we can show which version was agreed.
 * Lines the owner adds in Data kos come after the standard ones.
 */
export function termsClauses(t: TermsInput): { heading: string; body: string }[] {
  const s = t.settings;
  const standard = [
    {
      heading: "Sewa dan pembayaran",
      body: `Tipe kamar ${t.roomType}, mulai ${niceDate(t.startDate)}, kontrak ${t.termLabel}. Sewa ${rp(t.monthlyRent)} per bulan, dibayar di muka, jatuh tempo tanggal ${s.dueDayOfMonth} setiap bulan. Sewa bulan pertama ditagih setelah deposit diverifikasi, jatuh tempo pada tanggal masuk.`,
    },
    {
      heading: "Deposit",
      body: `Deposit ${rp(t.deposit)} dibayar lebih dulu untuk menyimpan kamar, dan dikembalikan paling lambat ${s.depositReturnDays} hari setelah penghuni keluar, dikurangi biaya kerusakan di luar pemakaian wajar. Pembatalan sebelum masuk atau sebelum jangka waktu minimum berakibat deposit tidak dikembalikan.`,
    },
    {
      heading: "Cara membayar",
      body: "Semua pembayaran lewat transfer bank ke rekening resmi yang dikirim asisten kami, lalu bukti transfer diunggah di website. Pembayaran dianggap sah setelah diverifikasi pemilik kos (1–2 hari kerja). Tidak ada pembayaran tunai kepada perorangan.",
    },
    {
      heading: "Keterlambatan",
      body: `Tagihan yang lewat jatuh tempo dikenakan denda ${rp(s.lateFeePerDay)} per hari, maksimal ${rp(s.lateFeeMax)} per tagihan.`,
    },
    {
      heading: "Listrik, air, dan internet",
      body: `Termasuk kuota listrik ${s.electricQuota} kWh per bulan. Kelebihan pemakaian ditagih ${rp(s.electricRate)} per kWh pada bulan berikutnya. ${s.utilitiesNote}.`,
    },
    {
      heading: "Tamu menginap",
      body: `Tamu menginap wajib didaftarkan dulu dan dikenakan biaya ${rp(s.guestFeePerNight)} per malam per orang, maksimal ${s.maxGuestNights} malam berturut-turut.`,
    },
    ...(s.houseRules.length ? [{ heading: "Aturan rumah", body: s.houseRules.map((r, i) => `${i + 1}) ${r}`).join("\n") }] : []),
    {
      heading: "Kontrak",
      body: "Nomor kamar diberitahukan paling lambat 7 hari sebelum tanggal masuk. Kontrak sewa resmi ditandatangani di atas kertas saat pindah masuk; kamar resmi menjadi milik penyewa setelah kontrak ditandatangani.",
    },
    {
      heading: "Data pribadi",
      body: "Data pribadi (nama, nomor HP, tanggal lahir, nomor dan foto KTP, bukti transfer) hanya dipakai untuk administrasi sewa, disimpan terenkripsi, dan dihapus paling lambat 12 bulan setelah sewa berakhir, sesuai UU No. 27 Tahun 2022.",
    },
  ];
  const extra = s.rentalTerms.filter((l) => l.trim()).map((body) => ({ heading: "Ketentuan tambahan", body }));
  return [...standard, ...extra].map((c, i) => ({ heading: `${i + 1}. ${c.heading}`, body: c.body }));
}

export function termsHash(t: TermsInput): string {
  const text = termsClauses(t)
    .map((c) => `${c.heading}\n${c.body}`)
    .join("\n\n");
  return sha256(text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim());
}

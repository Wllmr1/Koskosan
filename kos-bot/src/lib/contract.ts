import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { LeasePlan } from "@prisma/client";
import { maskId, maskPhone, sha256 } from "./crypto";
import { niceDate, rp } from "./money";

export type ContractData = {
  propertyName: string;
  propertyAddress: string;
  reference: string;
  tenantName: string;
  tenantPhone: string;
  tenantIdNumber: string;
  roomCode: string;
  roomType: string;
  roomSize: string;
  plan: LeasePlan;
  monthlyRent: number;
  deposit: number;
  startDate: Date;
  endDate: Date;
  termLabel: string;
  lateFeePerDay: number;
  lateFeeMax: number;
  dueDay: number;
  electricQuota: number;
  electricRate: number;
  guestFee: number;
  houseRules: string[];
  yearlyMonths: number;
};

/**
 * The exact wording the tenant signs. Rendered to the screen AND hashed, so we
 * can later prove which version they agreed to — the hash goes in the database
 * next to their signature.
 */
export function contractClauses(d: ContractData): { heading: string; body: string }[] {
  const yearly = d.plan === LeasePlan.YEARLY;
  return [
    {
      heading: "1. Para pihak",
      body: `Pihak Pertama: ${d.propertyName}, ${d.propertyAddress}.\nPihak Kedua: ${d.tenantName}, nomor HP ${maskPhone(d.tenantPhone)}, KTP ${maskId(d.tenantIdNumber)}.`,
    },
    {
      heading: "2. Objek dan jangka waktu sewa",
      body: `Kamar ${d.roomCode} (${d.roomType}, ${d.roomSize}). Sewa dimulai ${niceDate(d.startDate)} sampai ${niceDate(d.endDate)} (${d.termLabel}).`,
    },
    {
      heading: "3. Harga sewa dan pembayaran",
      body: yearly
        ? `Sewa ${rp(d.monthlyRent)} per bulan. Pembayaran tahunan di muka: ${d.yearlyMonths} bulan untuk 12 bulan sewa. Pembayaran berikutnya jatuh tempo tanggal ${d.dueDay}.`
        : `Sewa ${rp(d.monthlyRent)} per bulan, dibayar di muka, jatuh tempo tanggal ${d.dueDay} setiap bulan.`,
    },
    {
      heading: "4. Denda keterlambatan",
      body: `Keterlambatan dikenakan denda ${rp(d.lateFeePerDay)} per hari, maksimal ${rp(d.lateFeeMax)} per tagihan.`,
    },
    {
      heading: "5. Deposit",
      body: `Deposit ${rp(d.deposit)} dibayar di awal dan dikembalikan paling lambat 14 hari setelah Pihak Kedua keluar, dikurangi biaya kerusakan di luar pemakaian wajar.`,
    },
    {
      heading: "6. Listrik, air, dan internet",
      body: `Termasuk kuota listrik ${d.electricQuota} kWh per bulan. Kelebihan pemakaian ditagih ${rp(d.electricRate)} per kWh pada bulan berikutnya. Air dan wifi termasuk tanpa batas.`,
    },
    {
      heading: "7. Tamu menginap",
      body: `Tamu menginap wajib didaftarkan terlebih dahulu dan dikenakan biaya ${rp(d.guestFee)} per malam per orang, maksimal 3 malam berturut-turut.`,
    },
    { heading: "8. Aturan rumah", body: d.houseRules.map((r, i) => `${i + 1}) ${r}`).join("\n") },
    {
      heading: "9. Pembayaran resmi",
      body: "Seluruh pembayaran hanya melalui kanal resmi yang dikirim sistem. Tidak ada pembayaran tunai kepada perorangan. Pihak Pertama tidak bertanggung jawab atas pembayaran di luar kanal resmi.",
    },
    {
      heading: "10. Pengakhiran",
      body: "Pemberitahuan pengakhiran disampaikan paling lambat 30 hari sebelum tanggal keluar. Pengakhiran sebelum jangka waktu minimum berakibat deposit tidak dikembalikan.",
    },
    {
      heading: "11. Data pribadi",
      body: "Pihak Pertama menyimpan data pribadi Pihak Kedua (nama, nomor HP, tanggal lahir, nomor dan foto KTP) hanya untuk keperluan administrasi sewa, disimpan secara terenkripsi, dan dihapus paling lambat 12 bulan setelah sewa berakhir, sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.",
    },
    {
      heading: "12. Persetujuan",
      body: "Dengan menandatangani secara elektronik, kedua pihak menyatakan telah membaca dan menyetujui seluruh isi perjanjian ini. Tanda tangan elektronik, waktu, dan alamat IP dicatat sebagai bukti persetujuan.",
    },
  ];
}

/** Stable text used for the integrity hash. Whitespace-normalised on purpose. */
export function contractPlainText(d: ContractData): string {
  const header = `PERJANJIAN SEWA KAMAR KOS\n${d.propertyName}\nReferensi: ${d.reference}`;
  const body = contractClauses(d)
    .map((c) => `${c.heading}\n${c.body}`)
    .join("\n\n");
  return `${header}\n\n${body}`.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

export const contractHash = (d: ContractData) => sha256(contractPlainText(d));

/**
 * Builds the signed PDF: the same clauses, plus the signature image and the
 * integrity hash. Helvetica covers Indonesian text (plain Latin).
 */
export async function buildContractPdf(d: ContractData, signaturePng: Buffer, signedAt: Date, signedIp: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const A4: [number, number] = [595.28, 841.89];
  const margin = 56;
  const width = A4[0] - margin * 2;
  let page = pdf.addPage(A4);
  let y = A4[1] - margin;

  const ink = rgb(0.09, 0.1, 0.16);
  const muted = rgb(0.42, 0.44, 0.52);

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < margin) {
      page = pdf.addPage(A4);
      y = A4[1] - margin;
    }
  };

  const wrap = (text: string, size: number, f = font) => {
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(candidate, size) > width) {
          if (line) lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      lines.push(line);
    }
    return lines;
  };

  const write = (text: string, size: number, f = font, color = ink, gap = 4) => {
    for (const line of wrap(text, size, f)) {
      newPageIfNeeded(size + gap);
      page.drawText(sanitize(line), { x: margin, y: y - size, size, font: f, color });
      y -= size + gap;
    }
  };

  write("PERJANJIAN SEWA KAMAR KOS", 17, bold);
  y -= 2;
  write(`${d.propertyName} — ${d.propertyAddress}`, 9.5, font, muted);
  write(`Referensi ${d.reference}`, 9.5, font, muted);
  y -= 12;

  for (const clause of contractClauses(d)) {
    newPageIfNeeded(46);
    write(clause.heading, 11, bold);
    write(clause.body, 10, font, ink, 3.5);
    y -= 8;
  }

  // signature block
  newPageIfNeeded(170);
  y -= 10;
  write("Tanda tangan Pihak Kedua", 11, bold);
  y -= 4;

  try {
    const png = await pdf.embedPng(signaturePng);
    const scale = Math.min(190 / png.width, 70 / png.height);
    const w = png.width * scale;
    const h = png.height * scale;
    newPageIfNeeded(h + 48);
    page.drawImage(png, { x: margin, y: y - h, width: w, height: h });
    y -= h + 8;
  } catch {
    write("[tanda tangan tidak dapat ditampilkan]", 9, font, muted);
  }

  page.drawLine({
    start: { x: margin, y },
    end: { x: margin + 220, y },
    thickness: 0.6,
    color: muted,
  });
  y -= 14;
  write(d.tenantName, 10, bold);
  write(`Ditandatangani ${signedAt.toISOString()} dari IP ${signedIp}`, 8.5, font, muted, 3);
  write(`Integritas dokumen (SHA-256): ${contractHash(d)}`, 7.5, font, muted, 3);

  return Buffer.from(await pdf.save());
}

/** pdf-lib's standard fonts are WinAnsi; drop anything outside it rather than throwing. */
function sanitize(text: string): string {
  return text.replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

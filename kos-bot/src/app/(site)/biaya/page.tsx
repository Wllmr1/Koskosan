import { prisma } from "@/lib/prisma";
import { rp } from "@/lib/money";
import { roman } from "@/lib/site";
import { listRoomTypes } from "@/lib/room-types";
import FirstPaymentCalc from "@/components/site/FirstPaymentCalc";
import { NoData } from "@/components/site/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Biaya" };

const STEPS = [
  { t: "Pilih kamar", d: "Cek ketersediaan atau tanya asisten soal tipe dan harga." },
  { t: "Isi data diri", d: "Nama, kontak, KTP, dan tanggal masuk di formulir aman." },
  { t: "Tanda tangan digital", d: "Kontrak langsung di layar." },
  { t: "Bayar & serah kunci", d: "Bayar pembayaran pertama secara online, lalu terima kunci." },
];

export default async function FeesPage() {
  const [s, types] = await Promise.all([
    prisma.propertySetting.findUnique({ where: { id: "default" } }),
    listRoomTypes(),
  ]);
  if (!s) return <NoData />;

  const rows: [string, string][] = [
    ["Sewa", `Lihat harga tiap tipe di halaman Kamar. Kontrak bulanan minimal ${s.minMonths} bulan, atau tahunan: bayar ${s.yearlyMonths} bulan untuk 12 bulan sewa.`],
    ["Deposit", `${s.depositMonths}× sewa bulanan, dikembalikan maksimal ${s.depositReturnDays} hari setelah keluar`],
    ["Listrik", `Kuota ${s.electricQuota} kWh/bulan termasuk. Kelebihan ${rp(s.electricRate)}/kWh.`],
    ["Air dan wifi", s.utilitiesNote],
    ["Tamu menginap", `${rp(s.guestFeePerNight)} per malam, maksimal ${s.maxGuestNights} malam berturut-turut`],
    ["Telat bayar", `${rp(s.lateFeePerDay)}/hari setelah tanggal ${s.dueDayOfMonth}, maksimal ${rp(s.lateFeeMax)}`],
  ];

  return (
    <section className="page">
      <div className="sec-head">
        <div className="lbl">Biaya</div>
        <h1>Transparan, sejak awal.</h1>
        <p>Angka di halaman ini adalah sumber data yang dipakai asisten. Asisten tidak bisa mengarang harga atau memberi diskon.</p>
      </div>
      <table className="fee">
        <thead>
          <tr><th>Pos</th><th>Keterangan</th></tr>
        </thead>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}><td>{label}</td><td>{value}</td></tr>
          ))}
        </tbody>
      </table>

      {s.paymentTerms.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <h3 style={{ fontSize: 26, marginBottom: 16 }}>Syarat pembayaran</h3>
          <ul className="list">
            {s.paymentTerms.map((term, i) => (
              <li key={i}><i>{roman(i + 1)}</i><span>{term}</span></li>
            ))}
          </ul>
        </div>
      )}

      <FirstPaymentCalc types={types.map((t) => ({ name: t.name, monthlyPrice: t.monthlyPrice }))} depositMonths={s.depositMonths} />

      <div className="sec-head" style={{ margin: "72px 0 0" }}>
        <div className="lbl">Cara menyewa</div>
        <h2>Empat langkah, tanpa ke kantor.</h2>
      </div>
      <ol className="steps-ol">
        {STEPS.map((step, i) => (
          <li key={step.t}>
            <div className="n">{roman(i + 1)}</div>
            <div className="t">{step.t}</div>
            <div className="d">{step.d}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}

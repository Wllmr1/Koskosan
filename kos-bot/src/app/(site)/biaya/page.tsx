import { prisma } from "@/lib/prisma";
import { rp } from "@/lib/money";
import { List, NoData, PageHead, Section } from "@/components/site/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Biaya" };

export default async function FeesPage() {
  const s = await prisma.propertySetting.findUnique({ where: { id: "default" } });
  if (!s) return <NoData />;

  const rows: [string, string][] = [
    ["Sewa", `Lihat harga tiap kamar di halaman Kamar. Kontrak minimal ${s.minMonths} bulan.`],
    ["Bayar tahunan", `${s.yearlyMonths} bulan untuk 12 bulan sewa`],
    ["Deposit", `${s.depositMonths}× sewa bulanan, dikembalikan maksimal ${s.depositReturnDays} hari setelah keluar`],
    ["Listrik", `Kuota ${s.electricQuota} kWh/bulan termasuk. Kelebihan ${rp(s.electricRate)}/kWh.`],
    ["Air dan wifi", s.utilitiesNote],
    ["Tamu menginap", `${rp(s.guestFeePerNight)} per malam, maksimal ${s.maxGuestNights} malam berturut-turut`],
    ["Denda telat bayar", `${rp(s.lateFeePerDay)}/hari setelah tanggal ${s.dueDayOfMonth}, maksimal ${rp(s.lateFeeMax)}`],
  ];

  return (
    <>
      <PageHead title="Biaya dan cara bayar" sub="Angka di halaman ini adalah sumber data yang dipakai asisten. Asisten tidak bisa memberi diskon." />
      <Section title="Rincian biaya">
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr><th>Pos</th><th>Keterangan</th></tr>
            </thead>
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label}><td>{label}</td><td>{value}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Syarat pembayaran" sub={`Jatuh tempo tanggal ${s.dueDayOfMonth} setiap bulan.`}>
        <List items={s.paymentTerms} />
      </Section>
      <p className="small muted">
        Mau tahu total pembayaran pertama untuk kamar tertentu? <a href="/kamar">Pilih kamar</a> lalu tanya lewat chat.
      </p>
    </>
  );
}

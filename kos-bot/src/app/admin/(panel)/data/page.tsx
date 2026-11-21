import { prisma } from "@/lib/prisma";
import Notice from "@/components/admin/Notice";
import { Lines, Num, Text } from "@/components/admin/Fields";
import { requireAdmin } from "@/lib/auth";

export default async function PropertyPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireAdmin();
  const q = await searchParams;
  const s = await prisma.propertySetting.findUniqueOrThrow({ where: { id: "default" } });
  return (
    <form method="post" action="/api/admin/data/property" className="card" style={{ padding: 22 }}>
      <Notice saved={q.saved} error={q.error} />
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Identitas</h2>
      <div className="admin-grid">
        <Text name="name" label="Nama kos" value={s.name} max={80} />
        <Text name="tagline" label="Tagline" value={s.tagline} max={140} />
        <Text name="address" label="Alamat" value={s.address} max={200} />
        <Text name="mapsUrl" label="Link Google Maps" value={s.mapsUrl} max={500} hint="Harus diawali https://" />
      </div>

      <h2 style={{ fontSize: 18, margin: "24px 0 12px" }}>Angka yang dikutip asisten</h2>
      <div className="admin-grid">
        <Num name="dueDayOfMonth" label="Jatuh tempo sewa (tanggal)" value={s.dueDayOfMonth} min={1} max={28} />
        <Num name="minMonths" label="Kontrak minimal (bulan)" value={s.minMonths} min={1} max={24} />
        <Num name="yearlyMonths" label="Bayar tahunan: bayar berapa bulan" value={s.yearlyMonths} min={1} max={12} hint="11 = bayar 11, dapat 12" />
        <Num name="depositMonths" label="Deposit (× sewa bulanan)" value={s.depositMonths} min={0} max={6} />
        <Num name="depositReturnDays" label="Deposit kembali maks. (hari)" value={s.depositReturnDays} min={0} max={90} />
        <Num name="lateFeePerDay" label="Denda telat per hari (Rp)" value={s.lateFeePerDay} min={0} step={1000} />
        <Num name="lateFeeMax" label="Denda maksimal (Rp)" value={s.lateFeeMax} min={0} step={1000} />
        <Num name="electricQuota" label="Kuota listrik (kWh/bulan)" value={s.electricQuota} min={0} />
        <Num name="electricRate" label="Kelebihan listrik (Rp/kWh)" value={s.electricRate} min={0} step={50} />
        <Num name="guestFeePerNight" label="Biaya tamu per malam (Rp)" value={s.guestFeePerNight} min={0} step={1000} />
        <Num name="maxGuestNights" label="Tamu maks. malam berturut" value={s.maxGuestNights} min={1} max={30} />
        <Num name="maxGuestsAtOnce" label="Tamu maks. sekaligus" value={s.maxGuestsAtOnce} min={1} max={10} />
        <Num name="guestCutoffHour" label="Daftar tamu sebelum jam" value={s.guestCutoffHour} min={0} max={23} />
        <Text name="utilitiesNote" label="Air, wifi, dll." value={s.utilitiesNote} max={200} hint="Contoh: Air dan wifi termasuk, tanpa batas" />
      </div>

      <h2 style={{ fontSize: 18, margin: "24px 0 4px" }}>Rekening pembayaran</h2>
      <p className="muted small" style={{ margin: "0 0 12px" }}>
        Asisten memberikan rekening ini saat penyewa minta info pembayaran (deposit, sewa, listrik). Hanya rekening ini yang pernah disebut asisten.
      </p>
      <div className="admin-grid">
        <Text name="bankName" label="Bank" value={s.bankName} max={60} hint="Contoh: BCA" />
        <Text name="bankAccountNumber" label="Nomor rekening" value={s.bankAccountNumber} max={30} />
        <Text name="bankAccountName" label="Atas nama" value={s.bankAccountName} max={80} />
      </div>

      <h2 style={{ fontSize: 18, margin: "24px 0 12px" }}>Daftar</h2>
      <div className="admin-grid">
        <Lines name="facilities" label="Fasilitas" value={s.facilities} />
        <Lines name="paymentTerms" label="Syarat pembayaran" value={s.paymentTerms} />
        <Lines name="guestRules" label="Aturan tamu" value={s.guestRules} />
        <Lines name="houseRules" label="Aturan rumah" value={s.houseRules} />
        <Lines name="rentalTerms" label="Syarat & ketentuan tambahan" value={s.rentalTerms} />
      </div>
      <p className="muted small" style={{ margin: "8px 0 0" }}>
        Syarat &amp; ketentuan yang dicentang calon penghuni sudah memuat sewa, deposit, cara bayar, denda, listrik, tamu, aturan rumah, dan kontrak kertas. Baris tambahan di atas ditambahkan di bawahnya.
      </p>

      <button className="btn btn-pri" type="submit" style={{ marginTop: 20 }}>Simpan</button>
    </form>
  );
}

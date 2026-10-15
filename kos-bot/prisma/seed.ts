import { PrismaClient, RoomStatus } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Starter content. Edit the values here (or in the owner dashboard later) so
 * both the website and the assistant quote your real property.
 */
async function main() {
  await prisma.propertySetting.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      name: "Kos Wisma Anggrek",
      tagline: "Kos mahasiswa, 6 menit jalan kaki ke kampus",
      address: "Jl. Anggrek Raya No. 27, dekat gerbang timur kampus",
      mapsUrl: null,
      houseRules: [
        "Tidak merokok di dalam kamar",
        "Tamu lawan jenis hanya di ruang tamu",
        "Jam tenang 22.00–05.00",
        "Jam tamu 06.00–22.00",
        "Kontrak minimal 3 bulan",
      ],
      paymentTerms: [
        "Sewa dibayar di muka, jatuh tempo tanggal 5 tiap bulan",
        "Pilihan bulanan atau tahunan (tahunan bayar 11 bulan)",
        "Minimal kontrak 3 bulan",
        "Deposit 1× sewa, kembali maksimal 14 hari setelah keluar",
        "Bayar lewat QRIS, virtual account, atau e-wallet. Tidak ada pembayaran tunai ke siapa pun.",
      ],
      guestRules: [
        "Tamu wajib didaftarkan sebelum jam 21.00",
        "Biaya Rp50.000 per malam per orang",
        "Maksimal 3 malam berturut-turut, maksimal 2 tamu",
        "Data tamu: nama lengkap, nomor HP, dan nomor KTP",
        "Tamu lawan jenis tidak boleh menginap di kamar",
      ],
      facilities: [
        "Wifi 200 Mbps, router tiap lantai",
        "Dapur bersama dengan kompor dan microwave",
        "Ruang belajar 24 jam di lantai 1",
        "CCTV 24 jam dan akses pintu pakai PIN",
        "Parkir motor gratis, parkir mobil terbatas",
        "Dispenser air galon gratis",
      ],
    },
    update: {},
  });

  const rooms = [
    { code: "A-101", type: "Standard", floor: 1, sizeLabel: "3 × 3 m", monthlyPrice: 1_350_000, bathroom: "Kamar mandi luar", extras: "AC, kasur 120, lemari, meja belajar", status: RoomStatus.AVAILABLE },
    { code: "A-103", type: "Standard", floor: 1, sizeLabel: "3 × 3 m", monthlyPrice: 1_350_000, bathroom: "Kamar mandi luar", extras: "AC, kasur 120, lemari, meja belajar", status: RoomStatus.OCCUPIED },
    { code: "A-105", type: "Standard", floor: 1, sizeLabel: "3 × 3 m", monthlyPrice: 1_350_000, bathroom: "Kamar mandi luar", extras: "AC, kasur 120, lemari, meja belajar", status: RoomStatus.AVAILABLE },
    { code: "B-201", type: "Deluxe", floor: 2, sizeLabel: "3 × 4 m", monthlyPrice: 1_850_000, bathroom: "Kamar mandi dalam", extras: "AC, kasur 160, lemari besar, meja belajar, balkon kecil", status: RoomStatus.OCCUPIED },
    { code: "B-204", type: "Deluxe", floor: 2, sizeLabel: "3 × 4 m", monthlyPrice: 1_850_000, bathroom: "Kamar mandi dalam", extras: "AC, kasur 160, lemari besar, meja belajar", status: RoomStatus.OCCUPIED },
    { code: "B-206", type: "Deluxe", floor: 2, sizeLabel: "3 × 4 m", monthlyPrice: 1_850_000, bathroom: "Kamar mandi dalam", extras: "AC, kasur 160, lemari besar, meja belajar, balkon kecil", status: RoomStatus.AVAILABLE },
    { code: "C-301", type: "Studio", floor: 3, sizeLabel: "4 × 4 m", monthlyPrice: 2_500_000, bathroom: "Kamar mandi dalam + water heater", extras: "AC, kasur 160, pantry kecil, kulkas, meja belajar", status: RoomStatus.BOOKED },
    { code: "C-302", type: "Studio", floor: 3, sizeLabel: "4 × 4 m", monthlyPrice: 2_500_000, bathroom: "Kamar mandi dalam + water heater", extras: "AC, kasur 160, pantry kecil, kulkas, meja belajar", status: RoomStatus.AVAILABLE },
  ];

  for (const [index, room] of rooms.entries()) {
    await prisma.room.upsert({
      where: { code: room.code },
      create: { ...room, sortOrder: index },
      update: {},
    });
  }

  const services = [
    { name: "Laundry cuci setrika", priceNote: "Rp90.000/bulan (2× seminggu) atau Rp12.000/kg" },
    { name: "Bersih kamar mingguan", priceNote: "Rp60.000/bulan" },
    { name: "Galon antar ke kamar", priceNote: "Rp6.000/galon" },
    { name: "Titip paket di resepsionis", priceNote: "Gratis" },
  ];
  const nearby = [
    { name: "Gerbang timur kampus", distance: "6 menit jalan kaki" },
    { name: "Indomaret dan Alfamart", distance: "3 menit" },
    { name: "Warung makan dan burjo", distance: "2 menit" },
    { name: "Halte bus kampus", distance: "5 menit" },
    { name: "Klinik 24 jam", distance: "9 menit" },
    { name: "ATM BCA dan Mandiri", distance: "4 menit" },
    { name: "Lapangan futsal", distance: "8 menit" },
  ];
  const faq = [
    { question: "Apakah bisa sewa bulanan?", answer: "Bisa. Sewa bulanan jatuh tempo tanggal 5. Kontrak minimal 3 bulan. Kalau bayar tahunan di muka, hanya bayar 11 bulan." },
    { question: "Kapan bisa pindah masuk?", answer: "Kamar berstatus tersedia bisa ditempati setelah kontrak ditandatangani dan pembayaran pertama masuk." },
    { question: "Apakah listrik dibatasi?", answer: "Setiap kamar dapat kuota 100 kWh per bulan. Kelebihan dihitung Rp1.700 per kWh dan ditagih bulan berikutnya." },
    { question: "Boleh bawa tamu menginap?", answer: "Boleh, maksimal 3 malam berturut-turut, didaftarkan lewat asisten sebelum jam 21.00, biaya Rp50.000 per malam." },
    { question: "Bagaimana cara lapor kerusakan?", answer: "Lewat asisten WhatsApp. Keluhan dibuatkan tiket, dan yang mendesak langsung dikirim ke pemilik." },
    { question: "Apakah deposit kembali?", answer: "Kembali penuh maksimal 14 hari setelah keluar, dikurangi kerusakan di luar pemakaian wajar." },
  ];

  if ((await prisma.service.count()) === 0) {
    await prisma.service.createMany({ data: services.map((s, i) => ({ ...s, sortOrder: i })) });
  }
  if ((await prisma.nearbyPlace.count()) === 0) {
    await prisma.nearbyPlace.createMany({ data: nearby.map((n, i) => ({ ...n, sortOrder: i })) });
  }
  if ((await prisma.faqEntry.count()) === 0) {
    await prisma.faqEntry.createMany({ data: faq.map((f, i) => ({ ...f, sortOrder: i })) });
  }

  // Current electricity period for every room, so the quota tool has data.
  const period = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  for (const room of await prisma.room.findMany()) {
    await prisma.utilityPeriod.upsert({
      where: { roomId_period: { roomId: room.id, period } },
      create: { roomId: room.id, period, usedKwh: 0 },
      update: {},
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

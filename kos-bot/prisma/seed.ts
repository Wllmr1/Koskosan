import { LeasePlan, LeaseStatus, PrismaClient, RoomStatus } from "@prisma/client";
import { encrypt } from "../src/lib/crypto";

const prisma = new PrismaClient();


type Slot = { status: RoomStatus; availableOn?: string };
const FREE: Slot = { status: RoomStatus.AVAILABLE };
const taken = (availableOn: string): Slot => ({ status: RoomStatus.OCCUPIED, availableOn });
const MAINTENANCE: Slot = { status: RoomStatus.MAINTENANCE };

const DEMO_TYPES = [
  {
    slug: "standar", name: "Standar", prefix: "STD", floor: 1, monthlyPrice: 1_200_000, sizeLabel: "3 × 3 m",
    description: "Tempat tidur single berlaci, lemari, meja, dan wastafel bercermin di sudut kamar.",
    bathroom: "Kamar mandi luar", extras: "Tempat tidur single berlaci, lemari, meja, wastafel",
    isNew: false, isVip: false, hasEnsuite: false,
    rooms: [FREE, FREE, taken("2027-02-01"), taken("2027-04-01")],
  },
  {
    slug: "standard-new", name: "Standard New", prefix: "STN", floor: 2, monthlyPrice: 1_800_000, sizeLabel: "3 × 3,5 m",
    description: "Kamar di kos baru dengan panel kayu, lampu bernuansa hangat, kabinet sudut berlampu, dan kamar mandi dalam berpancuran.",
    bathroom: "Kamar mandi dalam, shower, cermin LED", extras: "AC, kabinet sudut berlampu, lemari, meja",
    isNew: true, isVip: false, hasEnsuite: true,
    rooms: [FREE, FREE, taken("2027-01-20"), taken("2027-03-10"), taken("2027-05-05"), taken("2027-07-01")],
  },
  {
    slug: "deluxe", name: "Deluxe", prefix: "DLX", floor: 1, monthlyPrice: 1_500_000, sizeLabel: "3 × 4 m",
    description: "Tempat tidur single, lemari tanam berpintu geser bercermin, meja belajar di depan jendela, rak dinding, dan wastafel.",
    bathroom: "Kamar mandi luar", extras: "Lemari pintu cermin, meja belajar, rak dinding, wastafel",
    isNew: false, isVip: false, hasEnsuite: false,
    rooms: [taken("2027-01-15"), taken("2027-03-01"), taken("2027-06-01")],
  },
  {
    slug: "new-deluxe", name: "New Deluxe", prefix: "NDX", floor: 2, monthlyPrice: 1_600_000, sizeLabel: "3 × 4 m",
    description: "Tempat tidur single dengan dinding aksen cokelat, meja belajar dengan rak gantung, dan AC.",
    bathroom: "Kamar mandi luar", extras: "AC, meja belajar, rak gantung, lemari",
    isNew: false, isVip: false, hasEnsuite: false,
    rooms: [FREE, MAINTENANCE, taken("2027-02-15")],
  },
  {
    slug: "vip-1", name: "VIP 1", prefix: "V1", floor: 3, monthlyPrice: 2_300_000, sizeLabel: "4 × 4 m",
    description: "Tempat tidur double berlaci dengan headboard kayu bergaris, dua lampu gantung, nakas di kedua sisi, lantai parket, dan lemari tanam.",
    bathroom: "Kamar mandi luar", extras: "Tempat tidur double, 2 nakas, lampu gantung, lemari, meja",
    isNew: false, isVip: true, hasEnsuite: false,
    rooms: [FREE, taken("2027-02-10")],
  },
  {
    slug: "vip-2", name: "VIP 2", prefix: "V2", floor: 3, monthlyPrice: 2_500_000, sizeLabel: "4 × 5 m",
    description: "Dua tempat tidur single berlaci, meja panjang dengan dua kursi di bawah jendela, dan lantai parket.",
    bathroom: "Kamar mandi luar", extras: "2 tempat tidur single, meja panjang dengan 2 kursi",
    isNew: false, isVip: true, hasEnsuite: false,
    rooms: [taken("2026-12-01"), taken("2027-02-01")],
  },
  {
    slug: "vip-a", name: "VIP A", prefix: "VA", floor: 3, monthlyPrice: 2_900_000, sizeLabel: "4 × 4,5 m",
    description: "Kamar di kos baru dengan lemari kayu setinggi plafon, meja kerja tanam berlampu rak, headboard berlengkung, dan kamar mandi dalam berjendela tinggi.",
    bathroom: "Kamar mandi dalam, shower, kloset duduk, cermin LED", extras: "AC, meja kerja tanam, lemari tinggi, nakas",
    isNew: true, isVip: true, hasEnsuite: true,
    rooms: [FREE, taken("2027-04-15")],
  },
];

/** Codes of the sample rooms an earlier seed created, before the real room types. */
const OLD_SAMPLE_CODES = ["A-101", "A-103", "A-105", "B-201", "B-204", "B-206", "C-301", "C-302"];

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function seedRoomTypes() {
  let demoTenant = 0;
  let roomOrder = 0;
  for (const [typeIndex, t] of DEMO_TYPES.entries()) {
    const { slug, name, description, sizeLabel, monthlyPrice, bathroom, extras, isNew, isVip, hasEnsuite } = t;
    const fields = { name, description, sizeLabel, monthlyPrice, bathroom, extras, isNew, isVip, hasEnsuite, sortOrder: typeIndex };
    // An interim type from the earlier sample seed (only sample rooms, e.g. "deluxe") is taken over with the new values.
    const existing = await prisma.roomType.findUnique({ where: { slug }, include: { rooms: { select: { code: true } } } });
    const interim = !!existing && existing.rooms.every((r) => OLD_SAMPLE_CODES.includes(r.code));
    const type = await prisma.roomType.upsert({ where: { slug }, create: { slug, ...fields }, update: interim ? fields : {} });

    for (const [i, slot] of t.rooms.entries()) {
      const code = `${t.prefix}-${i + 1}`;
      const availableOn = slot.availableOn ? utc(slot.availableOn) : null;
      const room = await prisma.room.upsert({
        where: { code },
        create: { code, roomTypeId: type.id, floor: t.floor, status: slot.status, availableOn, sortOrder: roomOrder },
        update: {},
      });
      roomOrder += 1;
      if (slot.status !== RoomStatus.OCCUPIED || !availableOn) continue;

      demoTenant += 1;
      const n = String(demoTenant).padStart(2, "0");
      const phone = `+6280000000${n}`;
      const idNumber = `31710000000000${n}`;
      const tenant = await prisma.tenant.upsert({
        where: { phoneE164: phone },
        create: {
          fullName: `Penghuni Demo ${demoTenant}`,
          phoneE164: phone,
          accountCode: `DEMO-${String(demoTenant).padStart(4, "0")}`,
          dateOfBirth: utc("2003-01-01"),
          idNumberEnc: encrypt(idNumber),
          idLast4: idNumber.slice(-4),
        },
        update: {},
      });
      if ((await prisma.lease.count({ where: { roomId: room.id, tenantId: tenant.id } })) === 0) {
        const start = new Date(availableOn);
        start.setUTCFullYear(start.getUTCFullYear() - 1);
        const end = new Date(availableOn.getTime() - 24 * 3600 * 1000);
        await prisma.lease.create({
          data: {
            tenantId: tenant.id, roomId: room.id, plan: LeasePlan.MONTHLY, monthlyRent: monthlyPrice,
            deposit: monthlyPrice, startDate: start, endDate: end, status: LeaseStatus.ACTIVE, signedAt: start,
          },
        });
      }
    }
  }

  await retireOldSamples();
}

/**
 * Removes the sample rooms (and interim types) an earlier seed created. A room
 * anyone has used (lease, application, a recorded meter reading) is only hidden.
 */
async function retireOldSamples() {
  const slugs = DEMO_TYPES.map((t) => t.slug);
  for (const room of await prisma.room.findMany({ where: { code: { in: OLD_SAMPLE_CODES } } })) {
    const used =
      (await prisma.lease.count({ where: { roomId: room.id } })) +
      (await prisma.application.count({ where: { roomId: room.id } })) +
      (await prisma.utilityPeriod.count({ where: { roomId: room.id, usedKwh: { gt: 0 } } }));
    if (used > 0) await prisma.room.update({ where: { id: room.id }, data: { hidden: true } });
    else await prisma.room.delete({ where: { id: room.id } }); // untouched meter rows cascade
  }
  await prisma.roomType.deleteMany({ where: { slug: { notIn: slugs }, rooms: { none: {} }, photos: { none: {} } } });
}

/**
 * Starter content. Edit the values here (or in the owner dashboard later) so
 * both the website and the assistant quote your real property.
 */
async function main() {
  await prisma.propertySetting.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      name: "RoemahKOE",
      tagline: "Hunian butik dekat kampus",
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
  // The one value we do replace: the old sample name that shipped before the real brand.
  await prisma.propertySetting.updateMany({
    where: { id: "default", name: "Kos Wisma Anggrek" },
    data: { name: "RoemahKOE", tagline: "Hunian butik dekat kampus" },
  });

  await seedRoomTypes();

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

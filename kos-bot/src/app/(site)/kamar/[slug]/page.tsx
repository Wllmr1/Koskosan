import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { niceDate, rp } from "@/lib/money";
import { onboardingAmount } from "@/lib/application";
import { isoDateOrNull, notBeforeToday, planOrNull, queryString, resolveKamarPath } from "@/lib/room-types";
import OpenChatButton from "@/components/OpenChatButton";
import { TypeFacts, TypeGallery } from "@/components/site/TypeBlock";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const found = await resolveKamarPath((await params).slug);
  return { title: found?.kind === "type" ? `Kamar ${found.type.name}` : "Kamar tidak ditemukan" };
}

const RENT_NOTICE: Record<string, string> = {
  penuh: "Maaf, kamar tipe ini baru saja diambil orang lain. Pilih tanggal lain, tipe lain, atau tanya lewat chat.",
  batas: "Terlalu banyak pendaftaran dari jaringan ini dalam satu jam. Coba lagi nanti, atau tanya lewat chat.",
  "tidak-ada": "Tipe kamar ini sudah tidak tersedia untuk disewa.",
};

const day = (d: Date) => d.toISOString().slice(0, 10);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function RoomTypePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const found = await resolveKamarPath((await params).slug, queryString(sp));
  if (!found) notFound();
  if (found.kind === "redirect") redirect(found.to);
  const type = found.type;
  const sewa = one(sp.sewa);
  const settings = await prisma.propertySetting.findUniqueOrThrow({ where: { id: "default" } });

  const { free } = type.availability;
  const nextFree = type.availability.nextFree && notBeforeToday(type.availability.nextFree);
  const today = day(new Date());
  const earliest = free > 0 ? today : nextFree ? day(nextFree) : null;
  const asked = isoDateOrNull(one(sp.masuk));
  const moveIn = earliest && asked && asked >= earliest ? asked : earliest;
  const chosenPlan = planOrNull(one(sp.lama)) ?? "bulanan";
  const deposit = type.monthlyPrice * settings.depositMonths;
  const plans = [
    {
      value: "bulanan",
      label: "Bulanan",
      note: `Kontrak minimal ${settings.minMonths} bulan, bayar tiap tanggal ${settings.dueDayOfMonth}.`,
      rent: type.monthlyPrice,
      total: onboardingAmount(type.monthlyPrice, "MONTHLY", settings.yearlyMonths, settings.depositMonths),
    },
    {
      value: "tahunan",
      label: "Tahunan",
      note: `Bayar ${settings.yearlyMonths} bulan untuk 12 bulan sewa.`,
      rent: type.monthlyPrice * settings.yearlyMonths,
      total: onboardingAmount(type.monthlyPrice, "YEARLY", settings.yearlyMonths, settings.depositMonths),
    },
  ];
  const chat = `Saya tertarik kamar ${type.name}`;

  return (
    <section className="page">
      <a className="back" href="/kamar">← Semua tipe kamar</a>
      <article className="room">
        <TypeGallery type={type} />
        <div className="info">
          <h1>{type.name}</h1>
          <TypeFacts type={type} />
          <div className="buy">
            <div className="p"><b>{rp(type.monthlyPrice)}</b> <small>/ bulan</small></div>
          </div>

          <div className="rent" id="sewa">
            <h3>{free > 0 ? "Sewa tipe kamar ini" : nextFree ? "Belum ada kamar kosong" : "Belum bisa disewa"}</h3>
            {sewa && RENT_NOTICE[sewa] && <p role="alert" style={{ margin: 0, color: "var(--warn)" }}>{RENT_NOTICE[sewa]}</p>}

            {earliest && moveIn ? (
              <form method="post" action="/api/apply/start" style={{ display: "contents" }}>
                <input type="hidden" name="type" value={type.slug} />
                {free === 0 && nextFree && (
                  <p style={{ margin: 0, color: "var(--ink-2)" }}>
                    Kamar {type.name} berikutnya kosong mulai {niceDate(nextFree)}. Anda tetap bisa memesan untuk tanggal itu.
                  </p>
                )}
                <div className="form">
                  <label>
                    <span className="lbl">Tanggal masuk</span>
                    <input type="date" name="moveIn" min={earliest} defaultValue={moveIn} required />
                  </label>
                </div>
                <fieldset className="opts" style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="lbl" style={{ marginBottom: 8, padding: 0 }}>Cara bayar</legend>
                  {plans.map((p) => (
                    <label key={p.value}>
                      <input type="radio" name="plan" value={p.value} defaultChecked={p.value === chosenPlan} />
                      <span>
                        <strong>{p.label}</strong>
                        <small>{p.note}</small>
                        <small>Sewa {rp(p.rent)} + deposit {rp(deposit)}</small>
                        <b>Pembayaran pertama {rp(p.total)}</b>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 14 }}>
                  Nomor kamar dipilihkan dari kamar {type.name} yang kosong. Termasuk kuota listrik {settings.electricQuota} kWh/bulan.
                </p>
                <button className="btn pri" type="submit" style={{ minHeight: 54 }}>
                  {free > 0 ? "Lanjut isi data" : `Pesan mulai ${niceDate(nextFree as Date)}`}
                </button>
              </form>
            ) : (
              <p style={{ margin: 0, color: "var(--ink-2)" }}>
                Semua kamar {type.name} sedang terisi dan belum ada perkiraan kapan kosong. Tanya asisten, atau lihat <a href="/kamar">tipe lain</a>.
              </p>
            )}
            <OpenChatButton className="btn" text={chat}>Tanya asisten{earliest ? " dulu" : ""}</OpenChatButton>
          </div>
        </div>
      </article>
    </section>
  );
}

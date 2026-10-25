import { prisma } from "@/lib/prisma";
import { rp } from "@/lib/money";
import { roman } from "@/lib/site";
import { NoData } from "@/components/site/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Aturan" };

function Numbered({ items }: { items: string[] }) {
  if (!items.length) return <p style={{ color: "var(--ink-2)" }}>Belum ada isi.</p>;
  return (
    <ul className="list">
      {items.map((item, i) => (
        <li key={i}><i>{roman(i + 1)}</i><span>{item}</span></li>
      ))}
    </ul>
  );
}

export default async function RulesPage() {
  const s = await prisma.propertySetting.findUnique({ where: { id: "default" } });
  if (!s) return <NoData />;

  return (
    <section className="page">
      <div className="sec-head">
        <div className="lbl">Aturan</div>
        <h1>Supaya semua nyaman.</h1>
        <p>Aturan yang sama tertulis di kontrak dan dipakai asisten.</p>
      </div>
      <div className="cols">
        <div>
          <h3>Aturan rumah</h3>
          <Numbered items={s.houseRules} />
        </div>
        <div>
          <h3>Tamu menginap</h3>
          <Numbered items={s.guestRules} />
          <p style={{ color: "var(--ink-2)", fontSize: 15, marginTop: 16 }}>
            Daftarkan tamu lewat asisten sebelum jam {s.guestCutoffHour}.00. Biaya {rp(s.guestFeePerNight)} per malam, maksimal {s.maxGuestNights} malam dan {s.maxGuestsAtOnce} tamu sekaligus.
          </p>
        </div>
      </div>
    </section>
  );
}

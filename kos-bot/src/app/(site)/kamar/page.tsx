import { prisma } from "@/lib/prisma";
import { niceDate } from "@/lib/money";
import { isoDateOrNull, listRoomTypes, planOrNull, type TypeCard } from "@/lib/room-types";
import { NoData } from "@/components/site/ui";
import TypeBlock from "@/components/site/TypeBlock";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kamar" };

const FILTERS = [
  { key: "all", label: "Semua" },
  { key: "new", label: "Kos baru" },
  { key: "vip", label: "VIP" },
  { key: "ensuite", label: "Kamar mandi dalam" },
  { key: "avail", label: "Tersedia saja" },
] as const;

const KEEP: Record<string, (t: TypeCard) => boolean> = {
  new: (t) => t.isNew,
  vip: (t) => t.isVip,
  ensuite: (t) => t.hasEnsuite,
  avail: (t) => t.availability.free > 0,
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const [settings, types] = await Promise.all([
    prisma.propertySetting.findUnique({ where: { id: "default" } }),
    listRoomTypes(),
  ]);
  if (!settings) return <NoData />;

  // Booking bar: ?tipe=<slug>&masuk=YYYY-MM-DD&lama=bulanan|tahunan. Invalid parts are ignored.
  const searched = types.find((t) => t.slug === one(sp.tipe)) ?? null;
  const masuk = isoDateOrNull(one(sp.masuk));
  const lama = planOrNull(one(sp.lama));
  const f = FILTERS.find((x) => x.key === one(sp.f))?.key ?? "all";
  const shown = searched ? [searched] : f === "all" ? types : types.filter(KEEP[f]);

  const carry = new URLSearchParams();
  if (masuk) carry.set("masuk", masuk);
  if (lama) carry.set("lama", lama);
  const tail = carry.size ? `?${carry}` : "";

  const fits = searched
    ? searched.availability.free > 0 ||
      (!!searched.availability.nextFree && (!masuk || searched.availability.nextFree.toISOString().slice(0, 10) <= masuk))
    : false;

  return (
    <section className="page">
      <div className="sec-head">
        <div className="lbl">Koleksi kamar</div>
        <h1>{types.length ? `${types.length} tipe kamar, satu standar.` : "Kamar"}</h1>
        <p>
          Harga sudah termasuk kuota listrik {settings.electricQuota} kWh. {settings.utilitiesNote}. Deposit {settings.depositMonths}× sewa.
        </p>
      </div>

      {searched && (
        <div className="searchbar">
          <span>
            Hasil untuk <b>{searched.name}</b>
            {masuk && <> · masuk <b>{niceDate(masuk)}</b></>}
            {lama && <> · <b>{lama === "tahunan" ? "Tahunan" : "Bulanan"}</b></>}
          </span>
          {masuk && (
            <span style={{ color: fits ? "var(--ok)" : "var(--warn)" }}>
              {fits ? "Tersedia di tanggal itu" : "Belum tersedia di tanggal itu"}
            </span>
          )}
          <a href="/kamar">Hapus pencarian</a>
        </div>
      )}

      {!searched && (
        <nav className="filters" aria-label="Saring tipe kamar">
          {FILTERS.map((x) => (
            <a key={x.key} href={x.key === "all" ? "/kamar" : `/kamar?f=${x.key}`} className={x.key === f ? "on" : ""} aria-current={x.key === f ? "page" : undefined}>
              {x.label}
            </a>
          ))}
        </nav>
      )}

      {shown.length ? (
        <div className="rt-list">
          {shown.map((t) => (
            <TypeBlock key={t.id} type={t} href={`/kamar/${t.slug}${tail}`} />
          ))}
        </div>
      ) : (
        <p className="muted">{types.length ? "Tidak ada tipe kamar yang cocok dengan saringan ini." : "Belum ada kamar yang ditampilkan."}</p>
      )}
    </section>
  );
}

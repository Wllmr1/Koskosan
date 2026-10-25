import { prisma } from "@/lib/prisma";
import { roman } from "@/lib/site";
import { NoData } from "@/components/site/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fasilitas" };

export default async function FacilitiesPage() {
  const [settings, services] = await Promise.all([
    prisma.propertySetting.findUnique({ where: { id: "default" } }),
    prisma.service.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  if (!settings) return <NoData />;

  return (
    <section className="page">
      <div className="sec-head">
        <div className="lbl">Fasilitas</div>
        <h1>Semua yang Anda butuhkan, sudah di sini.</h1>
        <p>Yang ada di dalam kos, dan layanan yang bisa dipesan lewat asisten.</p>
      </div>
      <div className="cols">
        <div>
          <h3>Di dalam kos</h3>
          {settings.facilities.length ? (
            <ul className="list">
              {settings.facilities.map((f, i) => (
                <li key={i}><i>{roman(i + 1)}</i><span>{f}</span></li>
              ))}
            </ul>
          ) : (
            <p style={{ color: "var(--ink-2)" }}>Belum ada isi.</p>
          )}
        </div>
        <div>
          <h3>Layanan berbayar</h3>
          {services.length ? (
            <ul className="list">
              {services.map((s) => (
                <li key={s.id}><b>{s.name}</b><span className="r">{s.priceNote}</span></li>
              ))}
            </ul>
          ) : (
            <p style={{ color: "var(--ink-2)" }}>Belum ada isi.</p>
          )}
          <p style={{ color: "var(--ink-2)", fontSize: 15, marginTop: 16 }}>Pesan atau tanya lewat asisten.</p>
        </div>
      </div>
    </section>
  );
}

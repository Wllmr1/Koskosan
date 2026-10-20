import { prisma } from "@/lib/prisma";
import { PhotoGrid } from "@/components/site/PhotoSlot";
import { List, NoData, PageHead, Section } from "@/components/site/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fasilitas" };

export default async function FacilitiesPage() {
  const [settings, services, gallery] = await Promise.all([
    prisma.propertySetting.findUnique({ where: { id: "default" } }),
    prisma.service.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.photo.findMany({ where: { roomId: null }, orderBy: { sortOrder: "asc" }, take: 9 }),
  ]);
  if (!settings) return <NoData />;

  return (
    <>
      <PageHead title="Fasilitas dan layanan" sub="Yang sudah ada di dalam kos, dan layanan tambahan yang bisa dipesan lewat asisten." />
      <section style={{ marginBottom: 20 }}>
        <PhotoGrid photos={gallery} slots={3} alt="Fasilitas kos" min={240} />
      </section>
      <div className="link-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))" }}>
        <Section title="Di dalam kos">
          <List items={settings.facilities} />
        </Section>
        <Section title="Layanan berbayar" sub="Pesan atau tanya lewat chat.">
          <List items={services.map((s) => `${s.name} — ${s.priceNote}`)} />
        </Section>
      </div>
    </>
  );
}

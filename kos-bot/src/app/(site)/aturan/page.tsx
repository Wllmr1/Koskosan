import { prisma } from "@/lib/prisma";
import { rp } from "@/lib/money";
import { List, NoData, PageHead, Section } from "@/components/site/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Aturan" };

export default async function RulesPage() {
  const s = await prisma.propertySetting.findUnique({ where: { id: "default" } });
  if (!s) return <NoData />;

  return (
    <>
      <PageHead title="Aturan" sub="Berlaku untuk semua penghuni." />
      <Section title="Aturan rumah">
        <List items={s.houseRules} />
      </Section>
      <Section
        title="Tamu menginap"
        sub={`Daftarkan tamu lewat chat sebelum jam ${s.guestCutoffHour}.00. Biaya ${rp(s.guestFeePerNight)} per malam, maksimal ${s.maxGuestNights} malam dan ${s.maxGuestsAtOnce} tamu sekaligus.`}
      >
        <List items={s.guestRules} />
      </Section>
    </>
  );
}

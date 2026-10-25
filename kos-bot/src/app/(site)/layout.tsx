import { prisma } from "@/lib/prisma";
import { botChatLink } from "@/lib/whatsapp";
import { brandLine, SITE_NAV } from "@/lib/site";
import SiteNav from "@/components/site/SiteNav";
import { currentRenter } from "@/lib/renter-auth";

export const dynamic = "force-dynamic";

/** Header and footer shared by every public page. */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [settings, renter] = await Promise.all([
    prisma.propertySetting.findUnique({ where: { id: "default" } }),
    currentRenter(),
  ]);
  const name = settings?.name ?? "Kos";
  const account = renter ? { href: "/akun", label: "Akun saya" } : { href: "/masuk", label: "Masuk penghuni" };
  const waLink = botChatLink("Halo, saya cari kos dekat kampus");

  return (
    <div className="rk">
      <SiteNav name={name} line={brandLine(settings?.tagline ?? "")} address={settings?.address} account={account} />

      <main className="wrap" style={{ paddingTop: 28, paddingBottom: 20 }}>{children}</main>

      <footer>
        <div className="wrap">
          <div className="foot-top">
            <div className="brand">
              <b>{name}</b>
              {settings?.tagline && <p>{settings.tagline}</p>}
            </div>
            <div className="foot-col">
              <span className="lbl">Jelajahi</span>
              {SITE_NAV.filter((item) => item.href !== "/").map((item) => (
                <a key={item.href} href={item.href}>{item.label}</a>
              ))}
            </div>
            <div className="foot-col">
              <span className="lbl">Kontak</span>
              {settings?.address && <span>{settings.address}</span>}
              {waLink && <a href={waLink}>WhatsApp asisten</a>}
              <a href={account.href}>{account.label}</a>
            </div>
          </div>
          <div className="foot-bot">
            <span>© {new Date().getFullYear()} {name}</span>
            <span>Data pribadi penyewa disimpan terenkripsi sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

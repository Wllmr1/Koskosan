import { prisma } from "@/lib/prisma";
import { botChatLink } from "@/lib/whatsapp";
import { SITE_NAV } from "@/lib/site";
import OpenChatButton from "@/components/OpenChatButton";
import SiteNav from "@/components/site/SiteNav";

export const dynamic = "force-dynamic";

/** Header and footer shared by every public page. */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const settings = await prisma.propertySetting.findUnique({ where: { id: "default" } });
  const name = settings?.name ?? "Kos";
  const waLink = botChatLink("Halo, saya cari kos dekat kampus");

  return (
    <>
      <header className="site-header">
        <div className="wrap">
          <a href="/" className="site-brand">{name}</a>
          <SiteNav />
          <div className="site-actions">
            {waLink && <a className="btn" href={waLink}>Chat di WhatsApp</a>}
            <OpenChatButton>Chat sekarang</OpenChatButton>
          </div>
        </div>
      </header>

      <main className="wrap" style={{ paddingTop: 28, paddingBottom: 20 }}>{children}</main>

      <footer className="site-footer">
        <div className="wrap small muted">
          <nav aria-label="Menu bawah">
            {SITE_NAV.map((item) => (
              <a key={item.href} href={item.href}>{item.label}</a>
            ))}
            <a href="/masuk">Masuk penghuni</a>
          </nav>
          {name}
          {settings?.address ? ` · ${settings.address}` : ""}
          <br />
          Data pribadi penyewa disimpan terenkripsi sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.
        </div>
      </footer>
    </>
  );
}

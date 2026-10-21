import { prisma } from "@/lib/prisma";
import { botChatLink } from "@/lib/whatsapp";
import { SITE_NAV } from "@/lib/site";
import OpenChatButton from "@/components/OpenChatButton";
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
    <>
      <header className="site-header">
        <div className="wrap">
          <a href="/" className="site-brand">{name}</a>
          <SiteNav account={account} />
          <div className="site-actions">
            <a className="btn" href={account.href}>{account.label}</a>
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
            <a href={account.href}>{account.label}</a>
          </nav>
          <strong className="footer-name">{name}</strong>
          {settings?.address && <div>{settings.address}</div>}
          Data pribadi penyewa disimpan terenkripsi sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.
        </div>
      </footer>
    </>
  );
}

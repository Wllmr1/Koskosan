"use client";

import { usePathname } from "next/navigation";
import { isActive, SITE_NAV } from "@/lib/site";

/** Top menu. On phones it folds into a "Menu" button (plain <details>, works without JavaScript). */
export default function SiteNav({ account }: { account: { href: string; label: string } }) {
  const pathname = usePathname() ?? "/";
  const links = SITE_NAV.map((item) => {
    const active = isActive(pathname, item.href);
    return (
      <a key={item.href} href={item.href} className={`site-link${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}>
        {item.label}
      </a>
    );
  });

  return (
    <>
      <nav className="site-nav" aria-label="Menu utama">{links}</nav>
      <details className="site-menu">
        <summary>Menu</summary>
        <nav aria-label="Menu utama">
          {links}
          <a href={account.href} className={`site-link${isActive(pathname, account.href) ? " is-active" : ""}`}>{account.label}</a>
        </nav>
      </details>
    </>
  );
}

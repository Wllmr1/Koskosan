"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { isActive, SITE_NAV } from "@/lib/site";

/** The public header: address, wordmark, account links, the menu, and on phones a "Menu"/"Tutup" toggle. */
export default function SiteNav({
  name,
  line,
  address,
  account,
}: {
  name: string;
  line: string;
  address?: string | null;
  account: { href: string; label: string };
}) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const link = (item: { href: string; label: string }, className?: string) => {
    const active = isActive(pathname, item.href);
    return (
      <a key={item.href} href={item.href} className={active ? "on" : undefined} aria-current={active ? "page" : undefined}>
        {item.label}
      </a>
    );
  };

  return (
    <header className="site-head">
      <div className="wrap">
        <div className="head-row">
          <div className="head-side">{address && <a className="tbtn" href="/lokasi">{address}</a>}</div>
          <a className="mark" href="/">
            <b>{name}</b>
            <span>{line}</span>
          </a>
          <div className="head-side end">
            <a className="tbtn" href={account.href}>{account.label}</a>
            <a className="btn pri" href="/kamar">Lihat kamar</a>
          </div>
          <button type="button" className="mbtn" aria-expanded={open} aria-controls="mmenu" onClick={() => setOpen((o) => !o)}>
            {open ? "Tutup" : "Menu"}
          </button>
        </div>
        <div className={`mmenu${open ? " on" : ""}`} id="mmenu">
          {SITE_NAV.map((item) => link(item))}
          <a className="btn" href={account.href}>{account.label}</a>
        </div>
        <nav className="main-nav" aria-label="Menu utama">
          {SITE_NAV.map((item) => link(item))}
        </nav>
      </div>
    </header>
  );
}

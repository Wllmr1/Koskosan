"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; count?: number; tone?: "p" };

/** Sidebar + top bar. Client-side only to know which page is open (and the phone menu toggle). */
export default function PanelFrame({
  brand,
  who,
  isOwner,
  counts,
  children,
}: {
  brand: string;
  who: string;
  isOwner: boolean;
  counts: { tagihan: number; terlambat: number; keluhan: number };
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  const groups: { title?: string; items: Item[] }[] = [
    { items: [{ href: "/admin", label: "Dashboard" }] },
    {
      title: "Sewa",
      items: [
        { href: "/admin/kamar", label: "Kamar" },
        { href: "/admin/tagihan", label: "Tagihan", count: counts.tagihan, tone: "p" },
        { href: "/admin/penghuni", label: "Penghuni" },
        { href: "/admin/pendaftaran", label: "Pendaftaran" },
      ],
    },
    {
      title: "Harian",
      items: [
        { href: "/admin/keluhan", label: "Keluhan", count: counts.keluhan },
        { href: "/admin/tamu", label: "Tamu menginap" },
        { href: "/admin/meteran", label: "Catat meteran" },
      ],
    },
    {
      title: "Lainnya",
      items: [
        { href: "/admin/notifikasi", label: "Notifikasi" },
        { href: "/admin/percakapan", label: "Percakapan" },
        { href: "/admin/data", label: "Data kos" },
        ...(isOwner ? [{ href: "/admin/admin", label: "Kelola admin" }] : []),
      ],
    },
  ];
  const all = groups.flatMap((g) => g.items);
  const current = all.find((i) => (i.href === "/admin" ? path === "/admin" : path === i.href || path.startsWith(`${i.href}/`)));
  const title = path === "/admin/penghuni/baru" ? "Tambah penghuni" : current?.label ?? "Dashboard";

  return (
    <div className="ad">
      <div className="shell">
        <aside className={open ? "side open" : "side"}>
          <a className="word" href="/admin">{brand}</a>
          {groups.map((g, gi) => (
            <div key={gi}>
              {g.title && <div className="grp">{g.title}</div>}
              {g.items.map((i) => (
                <a key={i.href} className={current?.href === i.href ? "nav on" : "nav"} href={i.href}>
                  {i.label}
                  {!!i.count && <span className={i.tone === "p" ? "c p" : "c"}>{i.count}</span>}
                </a>
              ))}
            </div>
          ))}
        </aside>
        <div className="main">
          <div className="top">
            <button className="btn menu-toggle" type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>Menu</button>
            <h1>{title}</h1>
            <div className="r">
              <span className="who">{who}</span>
              <a href="/" target="_blank" rel="noreferrer">Lihat situs</a>
              <form method="post" action="/api/admin/logout" style={{ margin: 0 }}>
                <button className="link" type="submit">Keluar</button>
              </form>
              <a className="btn pri" href="/admin/penghuni/baru">Tambah penghuni</a>
            </div>
          </div>
          <div className="body">{children}</div>
        </div>
      </div>
    </div>
  );
}

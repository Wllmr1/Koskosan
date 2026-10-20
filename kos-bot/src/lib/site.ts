/** The public website's pages, in menu order. */
export const SITE_NAV = [
  { href: "/", label: "Beranda" },
  { href: "/kamar", label: "Kamar" },
  { href: "/fasilitas", label: "Fasilitas" },
  { href: "/biaya", label: "Biaya" },
  { href: "/lokasi", label: "Lokasi" },
  { href: "/aturan", label: "Aturan" },
  { href: "/faq", label: "FAQ" },
] as const;

/** A menu item is active on its own page and on pages below it (/kamar → /kamar/A-101). */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Real photos first, then empty slots (null) until there are at least `count` tiles. */
export function fillSlots<T>(photos: T[], count: number): (T | null)[] {
  return photos.length >= count ? photos : [...photos, ...Array<null>(count - photos.length).fill(null)];
}

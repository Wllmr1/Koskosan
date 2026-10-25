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

/** Short line under the wordmark: "Kost · tagline", or just the tagline when that would be too long for the header. */
export function brandLine(tagline: string): string {
  const t = tagline.trim();
  return t.length > 32 ? t : `Kost · ${t}`;
}

/** 1 → "i", 4 → "iv", 12 → "xii" (numbering on the lists). */
export function roman(n: number): string {
  const parts: [number, string][] = [[10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let rest = n;
  let out = "";
  for (const [value, sym] of parts) {
    while (rest >= value) {
      out += sym;
      rest -= value;
    }
  }
  return out;
}

/** Order the owner's covers appear in on Beranda when the property gallery is too small. */
const HERO_TYPE_ORDER = ["vip-a", "standard-new", "vip-1"];

/**
 * Up to three photos for the Beranda strip: the property gallery when it has at least three,
 * otherwise type covers (vip-a, standard-new, vip-1 first, then any other type). Empty when there are none.
 */
export function heroPhotos<P>(gallery: P[], typeCovers: { slug: string; cover: P | null }[]): P[] {
  if (gallery.length >= 3) return gallery.slice(0, 3);
  const rank = (slug: string) => {
    const i = HERO_TYPE_ORDER.indexOf(slug);
    return i === -1 ? HERO_TYPE_ORDER.length : i;
  };
  return typeCovers
    .filter((t): t is { slug: string; cover: P } => t.cover !== null)
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rank(a.t.slug) - rank(b.t.slug) || a.i - b.i)
    .slice(0, 3)
    .map(({ t }) => t.cover);
}

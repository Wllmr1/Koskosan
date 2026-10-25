# Public website redesign (RoemahKOE look)

All code lives in `kos-bot/`. Visual reference: `assets/2026-10-25-site-prototype.html`
(a clickable, standalone prototype with sample data; open it in a browser). The original
inspiration file is the owner's `index.html` ("RoemahKOE Kost" sample design), whose CSS the
prototype copies.

Order of the larger programme, as agreed: **this redesign first**, then contract lengths and
late payments (`2026-10-23-contract-lengths-and-late-payments-design.md`, waiting on the
owner's answers), then date-based availability. The admin dashboard redesign is a later,
separate piece (reference: `assets/2026-10-25-admin-prototype.html`, not in scope here).

## Why

My partner likes the sample design's look (black and ivory, Bodoni Moda + Jost, square
corners, hairlines, boutique-hotel feel) but wants to keep the current site's structure,
features and database backend. The sample puts too much on one page; its content should be
spread across the existing pages. The real kos has **seven room types**, and visitors should
choose a type, not a room number.

## Goals

1. **New look on every public page**, following the prototype: tokens, typography, buttons,
   hairlines, square corners, the centered RoemahKOE-style wordmark header, the dark footer
   band. **Light only: no dark mode** (no `prefers-color-scheme` switch, no theme toggle).
2. **Same pages and routes as today:** `/`, `/kamar`, `/kamar/...`, `/fasilitas`, `/biaya`,
   `/lokasi`, `/aturan`, `/faq`, `/akun`, `/masuk`, plus the pages a renter passes through
   (`/apply/[token]`, `/paid/[code]`, `/atur-password/[token]`, `/verify/[token]`) restyled
   to match. All content still comes from the database exactly as now (PropertySetting,
   Room, Service, NearbyPlace, FaqEntry, Photo), so the site and the assistant never disagree.
3. **Header:** wordmark centered (property name from settings, with a short line under it),
   address link on the left, "Masuk penghuni" / "Akun saya" and a "Lihat kamar" button on the
   right, page menu below. **On phones** (≤ 640 px) the header is the wordmark plus a "Menu"
   button that opens the full page list and the account link.
4. **Beranda (`/`):** hero (eyebrow, tagline as the headline, one-line lead, "Tanya asisten"
   + "Lihat tipe kamar"), three photos, the booking bar overlapping the photos (room type,
   move-in date, length), then a **showcase of two room types: Standard New and VIP A** (big
   photo, short description, "N kamar tersedia"), a "Lihat ketujuh tipe kamar" button, and one
   short line linking to each other page (Fasilitas, Biaya, Lokasi, Aturan, FAQ) using the live
   counts the current home page already shows.
5. **Kamar (`/kamar`): one block per room type, no room numbers.** Each block: the type name
   with availability on the right, a black rule on top, alternate blocks on a full-width soft
   beige band; photo with thumbnails; tags (Kos baru or Kos lama, VIP, Kamar mandi dalam);
   description; specs (Ketersediaan, Ukuran, Kamar mandi, Isi kamar); price per month;
   "Lihat & sewa" (or "Pesan mulai [date]" when full). Filters: Semua, Kos baru, VIP,
   Kamar mandi dalam, Tersedia saja.
   Availability wording: **"N kamar tersedia"** (never "N dari M"); when none are free,
   **"Penuh · kosong mulai [earliest date]"**.
6. **Room type page** (a URL per type, under `/kamar/`): photos, description, specs, and the
   "Sewa tipe kamar ini" box with the first payment summary (rent + deposit) and "Lanjut isi
   data". When the type is full it says when the next room frees up and still lets the
   visitor book from that date (see goal 7). "Tanya asisten dulu" opens the chat.
7. **Renting by type:** pressing "Lanjut isi data" starts the existing application flow for a
   **free room of that type chosen by the system**. The renter does not choose the room. The
   room number appears in the contract and on `/akun` after signing, as today. Everything after
   that (form, contract, signature, payment, `/paid`) is the existing flow, restyled.
   **Booking in advance is allowed:** a visitor may choose a move-in date in the future, and
   for a full type may book a room that is occupied now but free by their move-in date (the
   system assigns a room whose current lease ends / `availableOn` is on or before that date,
   and the move-in date cannot be earlier than that). No limit on how far ahead for now
   (owner still to confirm; question 5.3 in the owner doc).
8. **Fasilitas:** two columns, "Di dalam kos" (numbered i, ii, iii…) and "Layanan berbayar"
   (name + price).
   **Biaya:** fee table, the **first-payment calculator** from the sample (pick a room type →
   first month + deposit = total), then the four steps to rent (i–iv).
   **Lokasi:** map (from `mapsUrl` when set) and the "Sekitar kos" grid of places + walking times.
   **Aturan:** house rules and overnight-guest rules as two numbered lists.
   **FAQ:** open/close list (+ / –), with a "Tanya asisten" link.
   **Akun, Masuk:** same features, new look.
9. **Footer:** dark band with the property name and tagline, a "Jelajahi" column of page
   links, a "Kontak" column (address, WhatsApp assistant link, account link), and the existing
   data-protection line.
10. **Chat:** keep the existing `ChatWidget` behaviour (same API, greeting, `?chat=1` /
    `?tanya=` handling, hidden on admin/apply pages) with three states: **button** ("Chat
    sekarang"), **small window**, **enlarged** window (big panel). The window has enlarge and
    minimise controls; minimise returns it to the button. On phones it opens full screen. Styled
    in the new look.
11. **Seven room types** (names exactly): Standar, Standard New, Deluxe, New Deluxe, VIP 1,
    VIP 2, VIP A. Each type needs, in the database and editable in admin: name, description,
    tags (new building, VIP, en-suite bathroom), bathroom, furnishings, size, monthly price, and its own photos
    (cover first). Each Room belongs to one type. Availability per type is derived from its
    rooms (count of AVAILABLE rooms; else the earliest `availableOn` among the others).
12. Works with no horizontal scroll at phone width (≥ 360 px), keeps today's accessibility
    basics (labels, focus outlines, alt text, `[hidden]`).

## Non-goals

- Dark mode.
- Date-based availability search: until that project, "Cek ketersediaan" opens `/kamar`
  filtered to the chosen type (move-in date and length are carried into the rent box where
  the current flow can use them, otherwise ignored).
- 3–48 month contracts: the rent box offers what the backend supports today (monthly /
  yearly) until the contract-lengths project replaces it. Do not show choices the backend
  cannot honour.
- Changing what the chatbot can do. Its tools keep working and may keep using room codes;
  only where they read price/size/bathroom/furnishings do they now read through the room's
  type (see "Room types: decided").
- The admin dashboard redesign.
- Real content: the owner is still supplying names, prices, sizes, contacts, etc. via the
  owner question docs. The site shows whatever the database holds.
- Anything from the sample design's "Ruang pemilik / owner view" section or its demo banner.

## Anti-goals

- A page that shows a price, availability or rule the database does not hold (the site is the
  assistant's source of truth; no hard-coded content).
- Any change that stops an existing flow working: renting online, chat, renter login and
  account, admin data editing, payments.
- Showing room numbers to visitors anywhere on the public pages.
- Breaking current room links: existing `/kamar/<room code>` URLs (shared by the bot or
  saved) must still lead somewhere sensible (e.g. that room's type page).

## Constraints

- Next.js app router, server components reading Prisma as today; follow existing code style
  and tests (Vitest unit + integration). Existing tests must keep passing; add tests for the
  room-type data, availability per type, and assigning a room when renting by type.
- Fonts from Google Fonts (Bodoni Moda, Jost) as in the sample. Photos keep going through the
  existing photo pipeline (`Photo` model, private storage, `/photos/[name]`).
- **Git:** the current checkout is on `admin-security` with uncommitted, unfinished admin-login
  work. Do not touch it. Build this on a new branch from `main` in a separate worktree.
- **There is no live data yet** (the site has never been published). The local database holds
  only sample data, so no data migration is needed: replace the sample rooms with the seven
  types and their rooms via the seed. My partner wants the site **ready to publish with demo
  data**: the database must be fully populated (types, rooms, settings, services, nearby,
  FAQ, photos) so every page and the rent flow work end to end; the owner's real values
  replace the demo values later through admin.
- **Occupancy demo data:** every occupied or booked demo room has a demo renter and lease, so
  the database shows who occupies each room: Tenant (name, phone, date of birth, KTP number
  stored encrypted as today, last 4 digits, account code) + Lease (room, start/end dates,
  rent, deposit, status). The schema already holds these; the seed creates obviously fake
  people (e.g. "Penghuni Demo 1", phone +62800…) so no real personal data is ever seeded.

## Room types: decided

- **Every room of a type is identical** in monthly price, size, bathroom and furnishings
  (and description and photos). These live on the **type**, not the room; a Room keeps only
  what is per-room (code, floor, status, availableOn, hidden, sort order, leases).
- Everything that reads price/size/bathroom/furnishings reads it through the room's type:
  public pages, rent box and first-payment amount, contract data (`buildContractData`),
  apply page, admin, and the chatbot tools (`search_rooms`, price lookups). One source only,
  so the site and the bot can never disagree.
- Prices are required (no "price not set" state). Demo prices are seeded now.

## Decided by my partner

- Sample design = look; current site = structure, features and backend.
- Landing page option B, simplified; showcase Standard New and VIP A.
- Content of the sample spread across existing pages (table in goals 4–9).
- Floating chat that can be enlarged and minimised back to a button.
- Light only, no dark mode.
- Seven room types with the photos the owner supplied; Kamar lists types only, no room
  numbers, but the same details plus availability; "N kamar tersedia"; clear separation
  between types (rule + alternating band, no numbering).
- When renting a type, the system picks the free room; room number shown after signing.
- First-payment calculator on Biaya; demo seed with mixed statuses; photos via local import
  (not in git); first free room assigned; old room links go to the type page (all approved
  after review).
- Type tags include "Kamar mandi dalam" (en-suite bathroom).
- Booking in advance allowed for now, no limit (to confirm with owner).
- Database holds occupancy: who lives in each room and their details (demo renters seeded).

## My calls (not confirmed by my partner)

- Phone header = wordmark + Menu button (partner wants to see it first).
- Tags shown: "Kos baru" or "Kos lama", plus "VIP" and "Kamar mandi dalam" where they apply;
  one filter per tag.
- Bathroom guesses in the prototype (Standar, Deluxe, New Deluxe "luar"; VIP 1, VIP 2 unknown)
  are sample data only — real values come from the owner.
- Which free room the system assigns: the first available by the room's existing sort order.
- Old `/kamar/<room code>` links redirect to that room's type page.
- Demo seed: the seven types with the prototype's descriptions, dummy prices/sizes, and
  2–6 rooms each with a mix of statuses (some AVAILABLE, some OCCUPIED with an `availableOn`
  date, one MAINTENANCE) so availability wording and "Penuh · kosong mulai" can be seen.
- Photos: the owner's 12 photos are **not committed to git**. A local seed/import step reads
  them from a folder path (e.g. the `roemahkoe-website/foto` folder) and puts them through the
  existing `Photo` pipeline as each type's photos (cover first, filename prefix → type, as in
  the prototype). If the folder is absent the seed still runs and types show the empty photo
  state. On the published site the owner can replace them in admin.
- Assigning a room skips rooms already held by another in-progress application (existing
  `roomHeldByAnother` logic).
- Hosting/publishing (production database, domain, deploy) is not part of this build; the
  existing Docker/Postgres setup is the target.

## Left to the builder

- Data model for room types (new model vs. other shape), URLs for type pages, how type photos
  relate to the existing `Photo` model, and the admin screens to edit types and assign rooms
  to types (kept in the current admin style; the admin redesign comes later).
- CSS organisation (rewrite `globals.css` vs. split files), component breakdown.
- How the booking bar hands its values to `/kamar`.
- Exact Indonesian microcopy where the prototype has none.

## Where things are today

- Site layout/header/footer: `src/app/(site)/layout.tsx`, `src/components/site/SiteNav.tsx`,
  `src/lib/site.ts` (`SITE_NAV`). Styles: `src/app/globals.css`.
- Pages: `src/app/(site)/*/page.tsx`; room page + rent box: `src/app/(site)/kamar/[code]/page.tsx`;
  rent start: `src/app/api/apply/start/route.ts` → `createApplication` in `src/lib/application.ts`.
- Chat: `src/components/ChatWidget.tsx`, `OpenChatButton.tsx`, mounted in `src/app/layout.tsx`.
- Photos: `src/components/site/PhotoSlot.tsx`, admin `src/app/admin/data/foto`.
- Seed: `prisma/seed.ts`.

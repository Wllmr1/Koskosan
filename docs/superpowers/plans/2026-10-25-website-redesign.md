# Website Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the public RoemahKOE site the sample design's look, organise rooms into seven room types (rented by type, booked in advance), and ship it with a fully populated demo database.

**Architecture:** A new `RoomType` model owns everything identical across a type (price, size, bathroom, furnishings, description, tags, photos); `Room` keeps per-room state. A small `src/lib/room-types.ts` module derives availability and labels and is the only place pages and the bot read type data from. Public styling lives in a new scoped stylesheet (`.rk`) so the admin keeps its current look until its own redesign.

**Tech Stack:** Next.js app router (server components), Prisma + Postgres (`prisma db push`, no migrations folder), Vitest (unit + integration against `TEST_DATABASE_URL`), sharp for photos.

**Spec:** `docs/superpowers/specs/2026-10-25-website-redesign-design.md` (visual reference: `docs/superpowers/specs/assets/2026-10-25-site-prototype.html`). Read both before starting.

## Global Constraints

- All code under `kos-bot/`. Work on branch `website-redesign` from `main` in a separate worktree; never touch the `admin-security` branch or its uncommitted files.
- Light only: no `prefers-color-scheme` rules, no theme toggle.
- Room type names exactly: `Standar`, `Standard New`, `Deluxe`, `New Deluxe`, `VIP 1`, `VIP 2`, `VIP A`.
- Availability copy exactly: `"{n} kamar tersedia"`; when none free: `"Penuh · kosong mulai {niceDate}"`; when none free and no date known: `"Penuh"`. Never "N dari M".
- Tag copy exactly: `Kos baru` / `Kos lama`, `VIP`, `Kamar mandi dalam`.
- No room code is shown to visitors on any public page (codes still appear in the contract, `/akun`, admin, and the bot).
- Every price, availability, rule shown comes from the database; no hard-coded content on public pages.
- Fonts: Bodoni Moda + Jost from Google Fonts (admin keeps Instrument Sans).
- Demo people in the seed are obviously fake (`Penghuni Demo N`, phones `+62800000000N`); no real personal data.
- Owner photos are never committed; they are imported from a local folder.

## Review Focus

- Two visitors press "Lanjut isi data" on the last free room of a type at the same time → the second must get the "penuh" notice, never the same room (Task 4 test).
- A move-in date earlier than an occupied room's free date → rejected with a clear message, both on the type page form and on the apply form (Task 4 tests).
- A type whose rooms are all hidden (or that has no rooms) → not listed on `/kamar`, not offered by the booking bar, its page 404s (Task 1 + Task 6 tests).
- Old links `/kamar/<room code>` for a hidden or unknown room → 404, not a redirect to a type (Task 6 test).
- Photo folder missing or containing unrelated files → seed and import still succeed; unknown files skipped with a log line (Task 2 test).

---

### Task 0: Worktree and baseline

**Files:** none

- [ ] **Step 1:** From repo root: `git worktree add ../chatbotDEMO-website -b website-redesign main`, then `cd ../chatbotDEMO-website/kos-bot && cp ../../chatbotDEMO/kos-bot/.env .env && npm install`.
- [ ] **Step 2:** Run `npx vitest run` — Expected: all tests pass (record the count). Run `npm run typecheck` — Expected: no errors.

---

### Task 1: RoomType model and the room-types module

**Files:**
- Modify: `prisma/schema.prisma` (Room, Photo; add RoomType)
- Create: `src/lib/room-types.ts`
- Modify (read type data through `room.roomType`): `src/lib/application.ts` (`buildContractData`), `src/lib/payments.ts:139-140`, `src/app/apply/[token]/page.tsx:31-58`, `src/app/api/apply/route.ts` (no field reads; leave), `src/lib/chat/tools.ts:108-149,182-199`, `src/lib/renter-account.ts`, `src/app/(site)/akun/page.tsx`, `src/app/admin/page.tsx`, `src/lib/photos.ts` (`roomId` → `roomTypeId`), any other compile error `npm run typecheck` reports
- Modify: `tests/helpers.ts`; every integration test that calls `prisma.room.create` (at least `rent-online`, `payments`, `onboarding-safety`, `admin-tenants`, `renter-account`, `guest-overlap`, `meter`, `pipeline`)
- Test: `tests/unit/room-types.test.ts`, `tests/integration/room-types.test.ts`

**Interfaces:**
- Produces (schema):
  ```prisma
  model RoomType {
    id           String   @id @default(cuid())
    slug         String   @unique // "vip-a"
    name         String   @unique // "VIP A"
    description  String   @default("")
    sizeLabel    String
    monthlyPrice Int
    bathroom     String
    extras       String
    isNew        Boolean  @default(false)
    isVip        Boolean  @default(false)
    hasEnsuite   Boolean  @default(false)
    sortOrder    Int      @default(0)
    rooms        Room[]
    photos       Photo[]
    updatedAt    DateTime @updatedAt
  }
  ```
  `Room`: remove `type, sizeLabel, monthlyPrice, bathroom, extras, description, photos`; add `roomTypeId String`, `roomType RoomType @relation(fields: [roomTypeId], references: [id])`, `@@index([roomTypeId, status])`; replace `@@index([status, monthlyPrice])` with `@@index([status])`.
  `Photo`: `roomId`/`room` → `roomTypeId String?` / `roomType RoomType? @relation(..., onDelete: Cascade)`, index `[roomTypeId, sortOrder]`. `roomTypeId null` = property gallery photo (unchanged meaning).
- Produces (`src/lib/room-types.ts`):
  - `type Availability = { free: number; nextFree: Date | null }`
  - `availabilityOf(rooms: Pick<Room, "status" | "availableOn" | "hidden">[]): Availability` — ignores hidden rooms; `free` = AVAILABLE count; `nextFree` = earliest `availableOn` among visible non-AVAILABLE, non-MAINTENANCE rooms, or null.
  - `availabilityLabel(a: Availability): string` — the Global Constraints copy.
  - `tagsOf(t: Pick<RoomType, "isNew" | "isVip" | "hasEnsuite">): string[]` — order: Kos baru|Kos lama, VIP, Kamar mandi dalam.
  - `type TypeCard = RoomType & { availability: Availability; photos: Photo[] }`
  - `listRoomTypes(): Promise<TypeCard[]>` — types with ≥1 visible room, ordered `sortOrder, name`, photos ordered cover first then `sortOrder`.
  - `getRoomType(slug: string): Promise<TypeCard | null>` — null for unknown slug or no visible rooms.
- Produces (`tests/helpers.ts`): `makeRoom(over?: { status?: RoomStatus; hidden?: boolean; availableOn?: Date | null; type?: Partial<RoomType> }): Promise<Room & { roomType: RoomType }>` — creates a uniquely named type (unless `over.type.id` given) and one room.

- [ ] **Step 1: Write failing unit tests** in `tests/unit/room-types.test.ts`:
  ```ts
  expect(availabilityOf([{status:"AVAILABLE",availableOn:null,hidden:false},{status:"OCCUPIED",availableOn:d("2027-01-15"),hidden:false}])).toEqual({free:1,nextFree:d("2027-01-15")})
  expect(availabilityOf([{status:"AVAILABLE",availableOn:null,hidden:true}]).free).toBe(0)
  expect(availabilityOf([{status:"MAINTENANCE",availableOn:d("2026-12-01"),hidden:false}]).nextFree).toBeNull()
  expect(availabilityLabel({free:2,nextFree:null})).toBe("2 kamar tersedia")
  expect(availabilityLabel({free:0,nextFree:d("2027-01-15")})).toBe("Penuh · kosong mulai 15 Januari 2027") // whatever niceDate() returns for that date
  expect(availabilityLabel({free:0,nextFree:null})).toBe("Penuh")
  expect(tagsOf({isNew:true,isVip:true,hasEnsuite:true})).toEqual(["Kos baru","VIP","Kamar mandi dalam"])
  expect(tagsOf({isNew:false,isVip:false,hasEnsuite:false})).toEqual(["Kos lama"])
  ```
- [ ] **Step 2:** `npx vitest run tests/unit/room-types.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3:** Update the schema as in Interfaces. **Ask the user before running** (it wipes local demo data, which the user said is fine but must confirm at execution time): `npx prisma db push --force-reset` against `DATABASE_URL`, then again with `DATABASE_URL=$TEST_DATABASE_URL`. Then `npx prisma generate`.
- [ ] **Step 4:** Implement `src/lib/room-types.ts` per Interfaces (use `niceDate` from `@/lib/money`).
- [ ] **Step 5:** `npx vitest run tests/unit/room-types.test.ts` — Expected: PASS.
- [ ] **Step 6: Fix every reader.** Run `npm run typecheck`; change each error to read through `roomType` (include `roomType: true` in the query). Bot: `search_rooms` filters `roomType: { name: { equals, mode: "insensitive" } }` and `roomType: { monthlyPrice: { lte } }`, orders by `{ roomType: { monthlyPrice: "asc" } }`, returns `type: r.roomType.name` etc. (same output keys as today); `fees` topic lists `prisma.roomType.findMany` ordered by price as `"{name}: {rp} per bulan"`. `photos.ts`: every `roomId` → `roomTypeId`; `addPhoto(opts: { roomTypeId: string | null; file: File; caption: string })`. Site pages that break (`/`, `/kamar`, `/kamar/[code]`, `ui.tsx` RoomCard) may be minimally patched to compile; they are rewritten in Tasks 6–8.
- [ ] **Step 7:** Add `makeRoom` to `tests/helpers.ts`; replace each test's inline `prisma.room.create` with it (keep each test's assertions unchanged; where a test asserted `room.monthlyPrice`, read `room.roomType.monthlyPrice`).
- [ ] **Step 8: Write failing integration test** `tests/integration/room-types.test.ts`: a type with one AVAILABLE + one hidden AVAILABLE room → `getRoomType(slug).availability.free === 1`; a type whose only room is hidden → `getRoomType` returns null and `listRoomTypes()` excludes it.
- [ ] **Step 9:** `npx vitest run` and `npm run typecheck` — Expected: all pass (same count as Task 0 plus the new tests). The seed may fail here; `tests/global-setup.ts` runs it — if so, do Task 2 Step 3 (seed rewrite) before this step.
- [ ] **Step 10:** Commit: `git commit -am "Room types: price, size, bathroom, furnishings and photos live on the type"` (add new files explicitly).

---

### Task 2: Demo seed and photo import

**Files:**
- Modify: `prisma/seed.ts`
- Create: `prisma/import-photos.ts`
- Modify: `package.json` (script `"db:photos": "tsx prisma/import-photos.ts"`)
- Test: `tests/integration/seed-and-photos.test.ts`

**Interfaces:**
- Consumes: schema from Task 1, `processPhoto` and `putObject` (`src/lib/photos.ts`, `src/lib/storage.ts`), `encrypt` (`src/lib/crypto.ts`).
- Produces: `importPhotos(folder: string): Promise<{ imported: number; skipped: string[] }>` exported from `prisma/import-photos.ts` (CLI: `npx tsx prisma/import-photos.ts <folder>`).

- [ ] **Step 1: Write failing test** `tests/integration/seed-and-photos.test.ts`:
  - after global setup (which runs the seed): `prisma.roomType.findMany()` names equal the seven names; every type has ≥2 rooms; at least one type has `availability.free === 0 && nextFree !== null`; every OCCUPIED demo room has an ACTIVE lease whose tenant `fullName` starts with `"Penghuni Demo"`.
  - `importPhotos(tmpDir)` where tmpDir holds `vip-a-1.jpg` (a tiny valid JPEG generated with sharp), `standard-new-2.jpg` and `notes.txt` → `imported === 2`, `skipped` contains `"notes.txt"`, the VIP A type has a cover photo; running it again imports 0 (already has photos).
  - `importPhotos("/no/such/folder")` resolves `{ imported: 0, skipped: [] }` without throwing.
- [ ] **Step 2:** `npx vitest run tests/integration/seed-and-photos.test.ts` — Expected: FAIL.
- [ ] **Step 3: Rewrite `prisma/seed.ts`.** Keep the PropertySetting, services, nearby and FAQ blocks; set `name: "RoemahKOE"`, `tagline: "Hunian butik dekat kampus"`. Seed the seven types (idempotent upsert by `slug`) with the prototype's `ROOMS` descriptions/bathroom/extras and these demo values:

  | slug | name | price | size | rooms | isNew | isVip | hasEnsuite |
  |---|---|---|---|---|---|---|---|
  | standar | Standar | 1200000 | 3 × 3 m | 4 (2 AVAILABLE) | no | no | no |
  | standard-new | Standard New | 1800000 | 3 × 3,5 m | 6 (2 AVAILABLE) | yes | no | yes |
  | deluxe | Deluxe | 1500000 | 3 × 4 m | 3 (0 AVAILABLE, next free 2027-01-15) | no | no | no |
  | new-deluxe | New Deluxe | 1600000 | 3 × 4 m | 3 (1 AVAILABLE, 1 MAINTENANCE) | no | no | no |
  | vip-1 | VIP 1 | 2300000 | 4 × 4 m | 2 (1 AVAILABLE) | no | yes | no |
  | vip-2 | VIP 2 | 2500000 | 4 × 5 m | 2 (0 AVAILABLE, next free 2026-12-01) | no | yes | no |
  | vip-a | VIP A | 2900000 | 4 × 4,5 m | 2 (1 AVAILABLE) | yes | yes | yes |

  Room codes `{prefix}-{n}` (`STD-1`, `STN-1`, `DLX-1`, `NDX-1`, `V1-1`, `V2-1`, `VA-1`…), upsert by code. Each OCCUPIED room gets one demo Tenant (upsert by phone `+62800000000N`, `fullName: "Penghuni Demo N"`, `idNumberEnc: encrypt("31710000000000NN")`, `idLast4`, `dateOfBirth: 2003-01-01`, `accountCode: "DEMO-000N"`) and an ACTIVE Lease (monthly, rent = type price, deposit = price × depositMonths, start = 12 months before `availableOn`, end = `availableOn` − 1 day). Delete nothing; re-running changes nothing.
- [ ] **Step 4:** Implement `importPhotos`: list files; map filename to slug by longest matching prefix (`standard-new-`, `new-deluxe-`, `vip-a-`, `vip-1-`, `vip-2-`, `standar-`, `deluxe-`); skip a type that already has photos; for each file: `processPhoto(buffer, "image/jpeg")`, `putObject`, `prisma.photo.create({ roomTypeId, isCover: first, sortOrder: index, ... })` in filename order. Missing folder → `{ imported: 0, skipped: [] }`. CLI entry prints the result.
- [ ] **Step 5:** `npx vitest run tests/integration/seed-and-photos.test.ts` — Expected: PASS.
- [ ] **Step 6:** Locally: `npm run db:seed` then `npm run db:photos -- "/Users/williamr/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_uy2ljq8si1g912_8874/msg/file/2026-10/roemahkoe-website/foto"` — Expected: `imported: 12`.
- [ ] **Step 7:** Commit `"Demo data: seven room types, rooms, demo renters; photo import from a local folder"`.

---

### Task 3: Admin — edit room types, assign rooms to types

**Files:**
- Modify: `src/lib/admin-forms.ts` (`roomSchema`: drop `type, sizeLabel, monthlyPrice, bathroom, extras, description`; add `roomTypeId: z.string().min(1)`; add `roomTypeSchema` + `parseRoomType(form)`)
- Modify: `src/components/admin/RoomFields.tsx` (type `<select name="roomTypeId">` instead of the dropped fields)
- Create: `src/components/admin/RoomTypeFields.tsx`, `src/app/admin/data/tipe/page.tsx` (list + "Tambah tipe"), `src/app/admin/data/tipe/[id]/page.tsx` (edit), `src/app/api/admin/data/room-types/route.ts` (POST create/update, same guard and redirect pattern as `src/app/api/admin/data/rooms/route.ts` on `main`)
- Modify: `src/app/admin/data/layout.tsx` (add "Tipe kamar" tab), `src/app/admin/data/kamar/*`, `src/app/api/admin/data/rooms/route.ts`, `src/app/admin/data/foto/page.tsx` + `src/app/api/admin/photos/route.ts` (choose a type instead of a room)
- Test: `tests/unit/admin-forms.test.ts` (extend), `tests/integration/admin-room-types.test.ts`

**Interfaces:**
- Produces: `roomTypeSchema` fields: `name text(2,40)`, `slug /^[a-z0-9-]{2,40}$/`, `sizeLabel text(1,40)`, `monthlyPrice int(100_000,100_000_000)`, `bathroom text(2,80)`, `extras ≤300`, `description ≤1500`, `isNew/isVip/hasEnsuite boolean (checkbox "on")`, `sortOrder int(0,999)`.

- [ ] **Step 1: Failing tests:** `parseRoomType` accepts a valid form and rejects `slug: "VIP A"` and `monthlyPrice: "50000"`; `parseRoom` now requires `roomTypeId` and ignores a posted `monthlyPrice`. Integration: POST to the room-types route as owner creates a type, a second POST with its id updates `monthlyPrice`, and a room's `/kamar` price then reads the new value through `getRoomType`.
- [ ] **Step 2:** Run them — Expected: FAIL.
- [ ] **Step 3:** Implement the schema, fields, pages, route and photo-manager switch (keep current admin styling and the `requireAdmin` guard used on `main`).
- [ ] **Step 4:** `npx vitest run` — Expected: PASS.
- [ ] **Step 5:** Commit `"Admin: edit room types and assign rooms to a type"`.

---

### Task 4: Rent by type, booking in advance

**Files:**
- Modify: `src/lib/application.ts` (add `createApplicationForType`; export `roomOpenOn`)
- Modify: `src/app/api/apply/start/route.ts` (accept `type` + `moveIn` instead of `room`; keep accepting `room` for old forms/bot links)
- Modify: `src/app/api/apply/route.ts` (`roomStillOpenFor` → use `roomOpenOn(app.id, roomId, moveIn)`; reject `moveInDate` before the room's `availableOn` when the room is OCCUPIED)
- Modify: `src/app/apply/[token]/ApplyFlow.tsx` + `page.tsx` (date input `min` = room `availableOn` when OCCUPIED, else today; default = `app.moveInDate`)
- Test: `tests/integration/rent-by-type.test.ts`

**Interfaces:**
- Produces:
  - `roomOpenOn(applicationId: string | null, roomId: string, moveIn: Date): Promise<boolean>` — true when the room is visible and (AVAILABLE, or BOOKED by this application, or OCCUPIED with `availableOn` ≤ `moveIn`) and not `roomHeldByAnother`.
  - `createApplicationForType(opts: { contactId: string | null; typeSlug: string; plan: LeasePlan; moveIn: Date }): Promise<{ reference: string; token: string; room: Room }>` — candidates = visible rooms of the type ordered `sortOrder, code`; picks the first for which `roomOpenOn(null, id, moveIn)`; stores `moveInDate: moveIn` on the application; throws `ApplicationError("not_found")` for unknown/empty type, `ApplicationError("unavailable")` when none qualifies.
- Consumes: `roomHeldByAnother` (existing), `getRoomType` (Task 1).

- [ ] **Step 1: Failing tests** (`rent-by-type.test.ts`, rooms via `makeRoom` sharing one type):
  - two AVAILABLE rooms (sortOrder 0,1) → first call gets room 0; after submitting details for it (status DETAILS_SUBMITTED), a second call gets room 1; a third call rejects `code: "unavailable"`.
  - only an OCCUPIED room with `availableOn = 2027-01-15` → `moveIn 2027-01-10` rejects `unavailable`; `moveIn 2027-01-15` succeeds and `application.moveInDate` equals it.
  - unknown slug → `not_found`.
  - POST `/api/apply/start` with `type=<slug>&moveIn=2027-01-15&plan=bulanan` redirects 303 to `/apply/...`; with an all-taken type redirects to `/kamar/<slug>?sewa=penuh`.
  - apply POST with `moveInDate` before the OCCUPIED room's `availableOn` → 400 with error `"Tanggal masuk paling cepat {niceDate(availableOn)}."`.
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement per Interfaces. `/api/apply/start`: rate limit and cookie handling unchanged; `moveIn` defaults to today when absent or before today.
- [ ] **Step 4:** `npx vitest run` — Expected: PASS (existing `rent-online` tests still pass via the `room` field path).
- [ ] **Step 5:** Commit `"Rent a room type: the system picks the room; book ahead from the date a room frees up"`.

---

### Task 5: Site shell — styles, header, footer, phone menu

**Files:**
- Create: `src/app/rk.css` (all public styles, every selector under `.rk`; port the prototype's CSS: tokens, `.btn`, `.lbl`, header, hero, `.book`, room blocks `.rt`, lists, fee table, calculator, steps, near grid, FAQ, footer, phone menu; light only)
- Modify: `src/app/layout.tsx` (import `./rk.css`; fonts URL adds `Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,500;1,6..96,400` and `Jost:wght@400;500;600`, keeps Instrument Sans; `themeColor: "#ffffff"`; default title from settings name is fine as "RoemahKOE")
- Modify: `src/app/(site)/layout.tsx` (wrap in `<div className="rk">`; new header/footer markup), `src/components/site/SiteNav.tsx` (desktop menu + phone "Menu"/"Tutup" toggle, client component)
- Test: `tests/unit/site.test.ts` (extend)

**Interfaces:**
- Consumes: `SITE_NAV`, `isActive` (`src/lib/site.ts`), `currentRenter`, `botChatLink`.

- [ ] **Step 1: Failing test:** `SITE_NAV` labels equal `["Beranda","Kamar","Fasilitas","Biaya","Lokasi","Aturan","FAQ"]` (guards the menu order) and `rk.css` contains no `prefers-color-scheme` (read the file in the test).
- [ ] **Step 2:** Run — Expected: FAIL only on the CSS assertion until the file exists.
- [ ] **Step 3:** Implement header (address link left → `/lokasi`; wordmark centre = settings name + `"Kost · " + tagline` line; right: account link + "Lihat kamar"), menu below, phone menu ≤640px; footer (name + tagline, "Jelajahi" links, "Kontak": address, WhatsApp link when `botChatLink()` is set, account link; data-protection line).
- [ ] **Step 4:** `npx vitest run tests/unit/site.test.ts` — PASS. `npm run dev`, open `/` at 1280px and 375px — header, menu toggle and footer match the prototype; admin pages (`/admin/login`) look unchanged.
- [ ] **Step 5:** Commit `"Site shell in the RoemahKOE look: header, phone menu, footer"`.

---

### Task 6: Kamar list, room-type page, old links

**Files:**
- Create: `src/components/site/TypeBlock.tsx` (one `.rt` block: heading row with name + availability, gallery with thumbnails (client), tags, description, specs, price, CTA), `src/components/site/Gallery.tsx` (client: cover + thumbnails switcher)
- Modify: `src/app/(site)/kamar/page.tsx` (list from `listRoomTypes()`; filters via `?f=new|vip|ensuite|avail` links; booking-bar params `?tipe=<slug>&masuk=YYYY-MM-DD&lama=<plan>` show a summary bar "Hasil untuk …" and only that type)
- Rename/rewrite: `src/app/(site)/kamar/[code]/page.tsx` → `src/app/(site)/kamar/[slug]/page.tsx` (type page + rent box posting `type`, `moveIn`, `plan` to `/api/apply/start`; `?sewa=` notices kept; full type: "Penuh · kosong mulai …", date input min = `nextFree`, button "Pesan mulai {date}")
- Modify: `src/components/site/ui.tsx` (remove `RoomCard`)
- Test: `tests/integration/kamar-pages.test.ts`

**Interfaces:**
- Consumes: `listRoomTypes`, `getRoomType`, `availabilityLabel`, `tagsOf` (Task 1); `onboardingAmount` (existing); POST fields of Task 4.
- Produces: `resolveKamarPath(param: string): Promise<{ kind: "type"; type: TypeCard } | { kind: "redirect"; to: string } | null>` in `src/lib/room-types.ts` — lowercase slug match → type; else uppercase room code of a visible room → `/kamar/{its type slug}`; else null (404).

- [ ] **Step 1: Failing tests:** `resolveKamarPath("vip-a")` → type; `resolveKamarPath("va-1")` (visible room) → redirect `/kamar/vip-a`; hidden room code → null; `"nope"` → null.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement `resolveKamarPath`, the pages and components (copy, layout and filters per spec goals 5–6 and the prototype). **Step 4:** `npx vitest run` — PASS; in the browser `/kamar`, filters, `/kamar/vip-a`, `/kamar/VA-1` (redirects), a full type page, and a real rent start reaching `/apply/...` all work; no room code visible on these pages.
- [ ] **Step 5:** Commit `"Kamar: one block per room type, type pages, old room links redirect"`.

---

### Task 7: Beranda and the info pages

**Files:**
- Modify: `src/app/(site)/page.tsx` (hero, three photos from the gallery or type covers, booking bar `<form action="/kamar" method="get">` with `tipe`/`masuk`/`lama`, showcase of `standard-new` and `vip-a` from `listRoomTypes()` (skip a missing one), "Lihat ketujuh tipe kamar", door links with today's live counts)
- Modify: `src/app/(site)/fasilitas/page.tsx`, `biaya/page.tsx` (+ create `src/components/site/FirstPaymentCalc.tsx`, client, props `{ types: { name: string; monthlyPrice: number }[]; depositMonths: number }`), `lokasi/page.tsx`, `aturan/page.tsx`, `faq/page.tsx` (`<details>` list)
- Test: `tests/unit/first-payment.test.ts`

**Interfaces:**
- Produces: `firstPayment(monthlyPrice: number, depositMonths: number): { rent: number; deposit: number; total: number }` in `src/lib/money.ts` (monthly plan; `total = rent + deposit`), used by the calculator and the type page summary.

- [ ] **Step 1: Failing test:** `firstPayment(1_500_000, 1)` → `{ rent: 1_500_000, deposit: 1_500_000, total: 3_000_000 }`; `firstPayment(2_000_000, 0).total === 2_000_000`.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement `firstPayment` and the pages per spec goals 4 and 8. **Step 4:** `npx vitest run` — PASS; check each page at 1280px and 375px against the prototype, no horizontal scroll.
- [ ] **Step 5:** Commit `"Beranda and info pages in the new look; first-payment calculator"`.

---

### Task 8: Chat widget — button, window, enlarged

**Files:**
- Modify: `src/components/ChatWidget.tsx` (state `mode: "button" | "window" | "big"`; header controls "Perbesar/Perkecil" (⤢/⤡) and "Kecilkan" (–) back to button; button label "Chat sekarang"; phones full screen via CSS), styles for `.chat-*` moved into `rk.css` under the new look while keeping the chat usable on non-`.rk` pages that still show it.
- Test: `tests/unit/chat-widget.test.ts` only if a pure helper is extracted; otherwise manual check (Step 3).

- [ ] **Step 1:** Implement; keep `OPEN_CHAT_EVENT`, `?chat=1`/`?tanya=`, `HIDDEN_ON`, API calls unchanged. `openWith` sets mode `"window"`.
- [ ] **Step 2:** `npm run typecheck` — no errors.
- [ ] **Step 3:** Browser: open, send a message (real reply from `/api/chat`), enlarge, shrink, minimise to button, reopen with history; at 375px it is full screen; "Tanya asisten" buttons open it.
- [ ] **Step 4:** Commit `"Chat: floating button that opens, enlarges and minimises"`.

---

### Task 9: Renter flow pages in the new look

**Files:**
- Modify: `src/app/apply/[token]/page.tsx` + `ApplyFlow.tsx` (wrap in `.rk`; stepper "Data diri · Kontrak · Tanda tangan · Pembayaran"; show the room type name — the room code appears only in the contract text as today), `src/app/paid/[code]/page.tsx`, `src/app/masuk/page.tsx`, `src/app/(site)/akun/page.tsx`, `src/app/atur-password/[token]/page.tsx`, `src/app/verify/[token]/page.tsx`
- Test: existing integration tests (no behaviour change)

- [ ] **Step 1:** Restyle only (markup classes, wrapper); no logic changes.
- [ ] **Step 2:** `npx vitest run` and `npm run typecheck` — PASS.
- [ ] **Step 3:** Browser: complete a full rent with the dev payment page (`/dev/pay/...`) on a demo type → `/paid` → log in at `/masuk` → `/akun` shows the assigned room number and contract.
- [ ] **Step 4:** Commit `"Rent form, payment result, login and account pages in the new look"`.

---

### Task 10: Final check

- [ ] **Step 1:** `npx vitest run`, `npm run typecheck`, `npm run build` — all succeed.
- [ ] **Step 2:** Walk the Review Focus list by hand in the browser (two tabs racing for the last free room of a type; too-early move-in date; a type with all rooms hidden; old hidden room link; 360px widths on every public page).
- [ ] **Step 3:** Remind the user to confirm the advance-booking limit with the owner (owner doc question 5.3).

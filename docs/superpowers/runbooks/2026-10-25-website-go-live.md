# Website redesign: go-live and merge runbook

For: the project owner / developer. Branch `website-redesign` (worktree
`chatbotDEMO-website`). All commands run from `kos-bot/`.

## 1. Pick the databases (needs your own decision)

The new schema cannot be `db push`ed onto the existing `kos` / `kos_test`
databases: `Room.roomTypeId` is new and required, the price/size/bathroom/etc.
columns moved off `Room` onto `RoomType`, and `Photo.roomId` became
`Photo.roomTypeId`. Prisma refuses this without a reset, and its AI-safety guard
will not let an assistant reset them for you. Choose one:

- **A. Reset the old databases yourself** (data in them is lost):
  `DATABASE_URL=…/kos npx prisma db push --force-reset`, same for `kos_test`.
- **B. Point the site at fresh, empty databases** (e.g. the `kos_site` /
  `kos_site_test` this branch already uses) by setting `DATABASE_URL` and
  `TEST_DATABASE_URL` in `.env`.

## 2. Build the data

```sh
npx prisma db push          # create the tables (empty database or after the reset)
npm run db:seed             # settings, the seven room types, rooms, demo renters
npm run db:photos -- <folder>   # one flat folder; files named by type, e.g. vip-a-1.jpg, standard-new-2.jpg
npm test                    # optional: proves the suite on TEST_DATABASE_URL
```

## 3. Merge order with `admin-security`

The other checkout (`chatbotDEMO`, branch `admin-security`, uncommitted) also
changes `prisma/schema.prisma` and the admin routes, and replaces the old owner
check: `isOwner()` (src/lib/auth.ts) becomes `isAdmin` / `requireAdmin` /
`requireOwner`, and dashboard POSTs use `adminPostGuard` + `auditActor()`
instead of `ownerPostGuard` + `actor: "owner"` (there `ownerPostGuard` still
exists but now means "the owner only, not staff admins").

Whichever branch lands second:

1. Merge `schema.prisma` by hand (keep both sets of models), then
   `npx prisma db push` again.
2. Port `src/app/api/admin/data/room-types/route.ts` to the guard in use
   (`adminPostGuard` and `actor: await auditActor()` if `admin-security` is
   in), and check `src/app/admin/data/tipe/*` sits behind the same admin layout
   guard as the other `/admin/data` pages.
3. Re-check `src/app/api/admin/data/rooms/route.ts`: on this branch a room no
   longer has its own price/size/bathroom fields (they live on its type).
4. `npm run typecheck && npm test && npm run build`.

## 4. Known, pre-existing

`docker-compose.yml` starts the app with `npx prisma migrate deploy`, but the
repo has no `prisma/migrations` folder, so that step does nothing. Use
`npx prisma db push` (or create migrations) before deploying with Docker.

## 5. Go-live checklist

- [ ] **Clear the demo occupancy first:** `npm run db:demo:clear`. It removes
      only the fake renters (account codes `DEMO-…`, "Penghuni Demo N") and their
      leases, invoices and readings, and frees their rooms. Safe to run twice;
      a later `npm run db:seed` does not bring them back.
- [ ] Only **after** that, turn on the rent cron (`/api/cron/reminders` in
      `vercel.json`, or the `cron` service in docker-compose) and WhatsApp
      (`WA_*` variables) — otherwise demo renters get rent invoices.
- [ ] Enter the real occupied rooms (dashboard → Penghuni baru), with each
      room's "kosong mulai" date.
- [ ] Confirm with the owner (owner doc question 5.3): how far ahead a room may
      be booked (no limit today), and the room-choice rule — a later move-in
      gets the occupied room that frees up latest before that date, so rooms
      free now stay free for earlier move-ins (easy to flip in
      `firstOpenRoomOfType`, src/lib/application.ts).

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

## 3. Dashboard logins (done — `admin-security` is merged)

Branch `admin-accounts` merged `admin-security` onto this redesign: the
room-type work is kept, and every dashboard page and POST now checks the
login (`requireAdmin` / `adminPostGuard`) and names who did it in the audit
log (`owner` or `admin:<email>`). After pulling it, run `npx prisma db push`
once (it only adds the `Admin`, `AdminSession` and `AdminSetupToken` tables).

**The owner logs in** at `/admin/login` with `OWNER_EMAIL` + `ADMIN_PASSWORD`
from `.env` (`OWNER_NAME` is the name shown as "Masuk sebagai …"). To change
the owner's password, change `ADMIN_PASSWORD` and restart.

**Adding a helper (staff):** owner → Dashboard → **Kelola admin** → "Tambah
admin" (name + email). The next page shows a one-time link once — copy it and
send it to the helper on WhatsApp. It works for 24 hours, once; the helper opens
it, chooses a password (minimum 10 characters), then logs in at
`/admin/login` with their email. Lost or expired link → "Buat link baru".
"Nonaktifkan" logs the helper out at once and blocks login; "Aktifkan" lets
them back in with the same password. Helpers can do everything in the
dashboard except Kelola admin.

Every login ends after 30 minutes without activity and after 4 hours in any
case. Login attempts are limited to 8 per IP per 15 minutes.

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

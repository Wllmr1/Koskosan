# Contract lengths and the late-payment ladder

Project 1 of 3 (then: availability from leases + admin timeline; then the website redesign).
All code lives in `kos-bot/`.

## Why

The owner wants contracts of 3, 6, 12, 24, 36 or 48 months, always paid month by month, and a
fixed, predictable rule for what happens when rent is late: reminders, a late fee, a termination
warning, and finally a termination that the owner decides. Today there are only two plans
(monthly with a 3-month minimum, or yearly paid upfront "pay 11 get 12"), late renters get a
WhatsApp nudge every 3 days forever, and the late fee is shown but never actually billed.

Exact lease end dates also matter for project 2, which works out room availability from leases.

## Goals

1. A renter picks a contract length of **3, 6, 12, 24, 36 or 48 months** wherever a contract
   starts: the "Sewa kamar ini" box on `/kamar/[code]`, the chatbot's `start_application` tool,
   and the admin "add a renter who signed on paper" form (`/admin/penghuni/baru`).
2. **Payment is always monthly.** First payment = one month's rent + deposit
   (`depositMonths × monthlyRent`). After that, one RENT invoice per month until the contract ends.
   The monthly price is the same whatever length is chosen.
3. The **yearly plan and "pay 11 get 12" disappear** from new contracts: rent box, bot,
   Biaya page, contract text, admin settings form.
4. The contract text and lease show the real length, and `Lease.endDate = startDate + months`.
5. **Late-payment ladder** per unpaid RENT invoice (day 0 = due date):
   - Before due: the existing "payment due" WhatsApp reminder (`rent_due_reminder`) stays.
   - Days 1–7 late: a reminder every 2 days (days 1, 3, 5, 7). No fee yet.
   - Day 8: late fee starts accruing daily and is **added to the bill**. A WhatsApp message
     says the contract will be terminated if the bill is not paid by **midnight (WIB) at the end
     of day 14**. A last-chance message on day 13.
   - After midnight of day 14: **nothing automatic happens to the contract.** The lease is
     flagged "Menunggu keputusan" in admin and waits for the owner.
   - Paying the full amount (rent + fee) at any point stops the ladder. A partial payment
     does not.
6. **Late fee** is set **per room type** from fixed steps: Rp 0, 25.000, 50.000, 75.000 or
   100.000 per day. It accrues from day 8, capped by the existing `lateFeeMax` setting. The
   rate in force at signing is copied onto the lease (like `monthlyRent`), so later changes
   never affect a signed contract. The contract text states the rate. The owner will choose the
   real amounts later; the system only needs a place to set them.
7. **Owner decision** on a flagged lease in admin, with two buttons:
   - **Putus kontrak (terminate):** lease becomes terminated; deposit is forfeited (recorded on
     the lease); the renter gets a WhatsApp notice that the contract has ended and they must
     move out within **3 days**, with the exact deadline date; `/akun` shows the same. The room
     shows in admin as "Kosong mulai [termination + 3 days], menunggu konfirmasi" and only
     becomes rentable (site + bot) after that date **and** the owner clicks **Kamar siap**.
   - **Pertahankan (keep):** the lease stays active, the renter stays marked late until they
     pay, fees keep accruing up to the cap, and no further ladder messages go out (it does not
     loop back to termination on its own).
8. **Status labels**, the same words on the renter's `/akun` page and in admin:
   *Jatuh tempo* (due, unpaid) → *Terlambat N hari* (late) → *Menunggu keputusan* (admin only,
   past day 14) → *Diputus* (terminated). Admin gets a "late renters" list sorted by days late,
   with the decision buttons on those past day 14.
9. Every ladder message sent and every owner decision is written to `AuditLog`.

## Non-goals

- Discounts for longer contracts, or paying several months upfront.
- Automatic termination without the owner.
- Renewals / extending a contract (not asked for; existing behaviour unchanged).
- Choosing the real late-fee amounts per room type (the owner decides later).
- Anything from projects 2 and 3 (availability engine, admin timeline, redesign).

## Anti-goals (would be a failure even if it "works")

- A contract ends, or a renter is told to leave, without the owner clicking terminate.
- A renter is sent more than one ladder message on the same day, or the same message twice.
- A signed contract's rent, length or late-fee rate changes because a setting changed later.
- A payment link asks for a different amount than the bill shows on `/akun` or in the bot.
- Existing leases (including any YEARLY ones) break or get re-billed differently.

## Constraints

- WhatsApp messages outside the 24-hour window must use Meta-approved templates. New templates
  are needed for: the day 1–7 reminder (or reuse `rent_overdue`), the day-8/13 termination
  warning, and the termination notice. Until approved, sends fail and are logged (the current
  pattern in `jobs.ts`); the ladder must not stall or double-send because of that. Template
  names and text go in the plan so the owner can submit them.
- The daily cron (`runRentCycle` in `src/lib/jobs.ts`) drives the ladder; it must be safe to run
  more than once a day.
- Dates are calendar dates (`@db.Date`); "midnight of day 14" means end of that day in WIB.
- Payment links come from Xendit with a fixed amount and expire after 24h
  (`ensurePaymentUrl` in `src/lib/billing.ts`). When the fee changes the bill, a stale link
  must not be reused.
- Follow the existing code style and tests (Vitest, `tests/unit`, `tests/integration`).

## Decided by my partner (as they said it)

- Lengths 3, 6, 12, 24, 36, 48 months; deposit; payment every month; same monthly price.
- Reminder every 2 days for the first week; the week after, a warning that the contract will
  be terminated if not paid by midnight of day 14; then wait for the owner's confirmation in
  admin. Renter flagged on both the admin and renter pages: due, then late.
- Late fee only after 7 days; rate chosen from 0/25/50/75/100 thousand per day; set per room
  type and stated in the terms and contract; when charged, it is added to the bill.
- On termination: deposit not returned, renter must move out within 3 days, room becomes
  available after those 3 days plus the owner's confirmation in admin.

## My calls (not confirmed by my partner)

- Day-1–7 reminders on days 1, 3, 5, 7; termination warning on day 8 and a last chance on day 13.
- Existing leases, including YEARLY ones, keep running unchanged to their end date.
- The list of lengths is fixed in code, not editable in the dashboard.
- `lateFeeMax` still caps the total fee per bill.
- "Keep" means: contract continues, late flag stays, no more automatic ladder messages.
- A terminated room is not shown as free publicly until the owner confirms "Kamar siap".
- The settings `yearlyMonths` and `minMonths` stop being used for new contracts (keep the
  columns for history unless the builder finds it cleaner to remove them).

## Left to the builder

- Data model: how to store the length (e.g. `termMonths` on Application and Lease), the
  per-type late-fee table (room `type` is a free-text string today; there is no RoomType
  model), forfeited deposit, termination date / move-out deadline, and the "room awaiting
  confirmation" state.
- Whether the late fee grows the RENT invoice's amount or lives in a linked LATE_FEE invoice,
  as long as the renter sees and pays one total and the ladder clears only when it is all paid.
- Where the late-renters list and buttons sit in admin.
- Exact wording of messages and labels (Indonesian, matching the current tone).

## Where things are today

- Plans: `LeasePlan` enum; `termMonths`, `onboardingAmount`, `termLabel` in
  `src/lib/application.ts`; rent box in `src/app/(site)/kamar/[code]/page.tsx`;
  `src/app/api/apply/start/route.ts`; bot tool in `src/lib/chat/tools.ts` (~line 244);
  paper-signed renters in `src/lib/admin-tenants.ts` and `src/app/admin/penghuni/baru/page.tsx`.
- Lease created on payment: `src/lib/payments.ts` (~line 175).
- Contract text: `src/lib/contract.ts`.
- Rent cycle and reminders: `src/lib/jobs.ts` (`issueUpcomingRent`, `remindUnpaid`).
- Late fee display only: `lateFeeFor` in `src/lib/billing.ts`, used by
  `src/lib/renter-account.ts` and the bot's account tool.
- Fees page: `src/app/(site)/biaya/page.tsx`; settings form: `src/app/admin/data/page.tsx`.

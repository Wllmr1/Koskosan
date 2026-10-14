# Website chat, renter login, and dashboard-managed data

Date: 2026-10-14
Status: approved in conversation, awaiting written-spec review

## 1. Purpose

Develop and refine the kos assistant on the website first, before any
WhatsApp number is connected. The assistant runs on the Claude API and is
reached through a chat window on the site. All property data and photos are
managed in the owner dashboard, which is the single source of truth for both
the website and the assistant. WhatsApp is added later by filling in its
settings, with no change to how the assistant behaves.

### Success criteria

1. With only `ANTHROPIC_API_KEY`, the database and the app secrets set, the
   app starts, the site loads, and the website chat answers.
2. A visitor can go from first message to a signed contract and a (simulated)
   payment, and land back in the chat with the confirmation waiting.
3. That new renter can log in on the site and the chat answers their bill,
   electricity quota, complaint and guest-registration requests.
4. The owner can edit every fact the assistant quotes, and upload photos, from
   the dashboard; the site and the assistant reflect a change immediately.
5. Adding WhatsApp later means filling in `.env` values only. The WhatsApp
   channel uses the same rules, tools and guardrails as the web chat.

### Decisions already made

| Topic | Decision |
|---|---|
| Data source | The dashboard; no import file |
| Chat architecture | One shared assistant core; web and WhatsApp are two channels |
| Replies | Whole replies with a typing indicator, no streaming |
| Renter identity on web | Phone number + password login page |
| Payments in development | Built-in fake payment page when no Xendit key is set |

### Out of scope

- Connecting WhatsApp itself (only keeping it working and making it optional).
- Email or SMS password reset (owner-issued setup links cover this for now).
- Streaming replies, multiple languages in the site UI, analytics.

## 2. Shared assistant core and channels

### 2.1 Contacts and channels

`Contact` gains:

- `channel` — `WEB` or `WHATSAPP` (enum `Channel`).
- `webSessionId` — unique, nullable. Set for web contacts.
- `waId` and `phoneE164` become nullable (still unique when present).

A web visitor is identified by an httpOnly, `SameSite=Lax`, `Secure` (in
production) cookie `kos_chat` holding a random 32-byte id signed with
`SESSION_SECRET`. The server never trusts an unsigned or tampered value; a
bad cookie is replaced with a fresh session.

Retention is unchanged: a prospect contact and its messages are deleted 24
hours after the last message; a renter's messages are kept 90 days.

### 2.2 Tools return actions instead of sending messages

`ChatCtx` gains `channel` and an `actions` collector. Tools no longer call
`sendCtaUrl`. Instead they call `ctx.addAction({ kind: "link", label, url })`.

`runAssistant` returns `{ text, actions, toolLog, usage }`. Each channel
renders actions its own way:

- Web: buttons inside the assistant's chat bubble.
- WhatsApp: one `cta_url` interactive message per action, sent after the text.

Actions are stored on the assistant `Message` (`actions Json?`) so a reloaded
chat shows the same buttons. Only URLs on `APP_URL` are accepted by
`addAction`; anything else throws.

Tools that produce actions:

| Tool | Action |
|---|---|
| `search_rooms` | "Lihat foto" → `/kamar/<code>` per returned room (max 3) |
| `start_application` | "Buka formulir" → `/apply/<token>` |
| `create_payment`, `register_guest` | "Bayar sekarang" → `/p/<invoice code>` |
| new `prompt_login` (web prospects on a renter question) | "Masuk" → `/masuk` |

`send_verification_link` is offered only on the WhatsApp channel.
`prompt_login` is offered only on the web channel, to non-logged-in visitors.

### 2.3 Shared message pipeline

The steps now inside the WhatsApp webhook move to `lib/chat/pipeline.ts`,
`handleInbound(ctx, text)`, used by both channels:

1. Muted contact → no reply.
2. Rate limits: per contact (12/min, 120/day) and, for web, per IP (60/min).
3. Save the user message.
4. Injection pre-filter with the 3-strikes-in-24h mute and owner alert.
5. `runAssistant`.
6. `guardReply` output filter.
7. Save the assistant message with its actions; write the audit row.

It returns `{ text, actions }` for the channel to deliver.

### 2.4 Web chat API

- `GET /api/chat` — returns the current conversation (role, text, actions,
  time) for the session, creating the session cookie if missing.
- `POST /api/chat` — body `{ message: string }`, max 600 characters. Runs the
  pipeline and returns `{ reply, actions }`. Rejects requests whose `Origin`
  is not the site's own (403). On assistant failure returns a friendly
  Indonesian error message, never a stack trace.

### 2.5 Chat widget

A client component mounted in the root layout on public pages (not on
`/admin`, `/apply`, `/dev`):

- Floating button bottom-right; opens a panel (full-screen under 640px).
- Loads history on open; shows a typing indicator while waiting; disables
  sending while a reply is pending.
- Renders action buttons in assistant bubbles.
- Opens automatically when the URL has `?chat=1`, and pre-fills the input
  when it has `?tanya=<text>` (used by "Tanya kamar ini").
- Text is rendered as plain text (React escaping); `*bold*` is the only
  formatting converted.
- Header shows "Masuk sebagai <first name> · Keluar" when a renter is logged in.

The site's "Chat di WhatsApp" buttons become "Chat sekarang" and open the
widget. `WA_BOT_PHONE_E164` becomes optional; when set, a secondary "Chat di
WhatsApp" link is shown as well.

### 2.6 Closing the loop after payment

`/paid/<code>` keeps its "Kembali ke chat" button, now pointing to
`/?chat=1`. On successful onboarding the confirmation text is saved as an
assistant message in the applicant's conversation (web) and, when WhatsApp
is enabled and the contact is a WhatsApp contact, also sent there.

Because a web prospect's contact would otherwise be purged after 24 hours,
`promoteToMember` (already called on onboarding) converts the contact to a
member, links the tenant and stops expiry, exactly as today.

## 3. Renter login

### 3.1 Password creation

The secure form's step 1 gains "Buat password" and "Ulangi password" (min 10
characters, must match, not equal to the phone number). The password is
hashed with Node's `crypto.scrypt` (N=16384, r=8, p=1, 16-byte salt, 64-byte
key), stored as `scrypt$<salt hex>$<hash hex>` on `Application.passwordHash`
and copied to `Tenant.passwordHash` on onboarding. Plain passwords are never
stored or logged.

### 3.2 Login

- `GET /masuk` — form: phone number, password.
- `POST /api/auth/login` — normalises the phone, verifies with a constant-time
  compare. Failure messages never reveal whether the phone exists.
- Lockout: 5 failures per phone or per IP in 15 minutes → 429 for 15 minutes.
- Success sets `kos_renter` (httpOnly, signed with `SESSION_SECRET`, 7 days)
  containing the tenant id and a `sessionVersion`.
- `POST /api/auth/logout` clears it.
- `Tenant.sessionVersion` (int) increments on password change, invalidating
  every existing renter session.

### 3.3 Chat behaviour

When a valid `kos_renter` cookie is present and the tenant has an active
lease, the web chat context is a verified renter: renter tools available,
identity header as today. The renter's chat is a separate `Contact`
(channel `WEB`, member) keyed to the tenant, so the anonymous prospect chat
on the same browser is not merged and still expires after 24 hours.

A logged-out visitor asking about bills, quota, complaints or guests gets the
`prompt_login` button. Renter tools are never in the tool list for them.

### 3.4 Password setup links

The dashboard's "Penghuni aktif" table gets a "Buat link atur password"
button per renter. It creates a single-use token (hash stored, 24 h expiry),
shows the link once for the owner to copy and send, and audits the action.
`/atur-password/<token>` lets the renter set a new password (same rules),
increments `sessionVersion` and marks the token used. This also covers
renters created before this feature.

## 4. Dashboard-managed data and photos

### 4.1 Data pages (`/admin/data/...`, owner session required)

- **Properti** — name, tagline, address, maps URL; numbers: guest fee per
  night, late fee per day, late fee cap, electricity quota and rate, due day,
  yearly months, minimum months, guest cutoff hour, max guest nights, max
  guests at once, deposit months, deposit return days; text: utilities note
  (e.g. "Air dan wifi termasuk, tanpa batas"); lists (one per line): house
  rules, payment terms, guest rules, facilities.
- **Kamar** — list plus add/edit: code, type, floor, size, monthly price,
  bathroom, extras, description, status, available-from, sort order, hidden.
  A room with any lease or application cannot be deleted, only hidden. Hidden
  rooms disappear from the site and from `search_rooms`.
- **Layanan**, **Sekitar**, **FAQ** — add, edit, delete, reorder.
- **Foto** — property gallery (see 4.2).

All writes: owner session check, same-origin check, zod validation, audit
log row, then `revalidatePath("/")` and the affected `/kamar/<code>` paths.

The existing quick room editor on `/admin` stays.

### 4.2 Photos

Model `Photo { id, roomId?, caption, key, width, height, sortOrder, isCover,
createdAt }`; `roomId` null means a property gallery photo.

Upload: JPG/PNG/WEBP, max 8 MB, checked by magic bytes, then re-encoded with
`sharp` to WEBP, longest side 1600 px, with all metadata (EXIF, GPS)
stripped. Stored under storage prefix `photos/` — separate from private
`ktp/`, `contracts/` and `signatures/`. Served by `GET /photos/<key>` which
only accepts keys matching `^photos/[A-Za-z0-9_-]+\.webp$` and sets long
cache headers. Deleting a photo removes the file.

### 4.3 Hard-coded facts move to data

The following literals in tools, the site and the contract are replaced by
`PropertySetting` fields: deposit months (1), deposit return days (14),
utilities note, maximum guest nights (3), maximum guests at once (2).

### 4.4 Website

- Gallery at the top of the home page (property photos).
- Room cards show the cover photo and link to `/kamar/<code>`.
- `/kamar/<code>`: all photos, details, price, status, description, and a
  "Tanya kamar ini" button → `/?chat=1&tanya=Saya tertarik kamar <code>`.
- Hidden rooms return 404.
- The home page becomes dynamic (no 60-second cache) so availability is live.

## 5. Running without WhatsApp or Xendit

### 5.1 Settings

Required: `APP_URL`, `DATABASE_URL`, `ENCRYPTION_KEY`, `SESSION_SECRET`,
`CRON_SECRET`, `ADMIN_PASSWORD`, `ANTHROPIC_API_KEY`, `OWNER_NAME`,
`OWNER_EMAIL`.

Optional groups, each enabled only when every value in it is set:

- WhatsApp: `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`, `WA_APP_SECRET`,
  `WA_VERIFY_TOKEN`, `WA_BOT_PHONE_E164`, `OWNER_PHONE_E164`.
- Xendit: `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN`.
- Email: `RESEND_API_KEY`.

`lib/features.ts` exposes `whatsappEnabled()`, `paymentsLive()`,
`emailEnabled()`. When WhatsApp is disabled the webhook returns 404 and rent
reminders skip sending (invoices are still created). In production
(`NODE_ENV=production`) the app refuses to boot if Xendit is not configured.

`CLAUDE_MODEL` default changes to the current Haiku model (`claude-haiku-5-5`);
the cost estimate in `assistant.ts` is updated to match its pricing.

### 5.2 Fake payments

The body of the Xendit webhook moves to `lib/payments.ts`,
`recordPayment({ invoiceCode, eventId, amount, method, paidAt })`, which does
the idempotency check, payment row, invoice update and post-payment handling
(onboarding, guest approval, rent confirmation). The Xendit webhook becomes a
thin wrapper that verifies the token and calls it.

When `paymentsLive()` is false and not in production, `ensurePaymentUrl`
returns `/dev/pay/<invoice code>`. That page shows the invoice description
and amount with "Simulasikan bayar" and "Simulasikan kedaluwarsa". The first
calls `recordPayment` with method `SIMULATED` and then redirects to
`/paid/<code>`; the second marks the invoice expired. All `/dev/*` routes
return 404 in production or when payments are live.

### 5.3 Notifications

- Owner alerts: recorded in `OwnerNotification` and always shown on the
  dashboard. Email is sent when email is enabled; WhatsApp when WhatsApp is
  enabled. A disabled channel is recorded as `not configured`, which is not an
  error and is not retried. Only enabled channels that fail are retried
  hourly, as today.
- Renter confirmations (payment received, guest approved, contract welcome)
  are saved into the renter's web conversation, and sent on WhatsApp when the
  contact is a WhatsApp contact and WhatsApp is enabled.

### 5.4 Conversation review page

`/admin/percakapan`: the 50 most recently active conversations, each showing
channel, prospect or renter (name and room for renters, "Pengunjung" for
prospects), and the transcript with tool names used and any filter flags.
Read-only. Full ID or phone numbers never appear (the output filter already
masks them; the page also runs `guardReply` masking on user text).

## 6. Security notes

- All new state-changing routes check the owner or renter session as
  appropriate and reject cross-origin requests.
- Renter tools receive the tenant id from the server-side session only; the
  model never chooses whose data it reads (unchanged principle).
- Login, chat and upload routes are rate limited.
- The CSP stays as is; photos are same-origin.
- Signed cookies use HMAC-SHA256 with `SESSION_SECRET`, and the renter cookie
  also carries `sessionVersion` so a password change logs out every device.

## 7. Error handling

- Claude API failure → chat shows "Maaf kak, sistemnya lagi bermasalah
  sebentar. Coba kirim ulang ya 🙏"; the user message stays saved.
- Rate limit → friendly message with no reply from the model.
- Photo processing failure → dashboard shows the reason; nothing is stored.
- Fake payment on an already-paid invoice → redirect to `/paid/<code>`.

## 8. Testing

- Add `vitest` with `npm test`.
- Unit tests: `guardReply`; guest-overlap rule; password hash/verify and
  rejection rules; signed cookie tamper detection; action URL restriction;
  feature flags from env.
- Integration test against the local database: `recordPayment` on an
  onboarding invoice creates tenant, lease and occupied room, saves the
  confirmation message and records the owner alert; running it twice changes
  nothing.
- End-to-end check in the browser: chat → choose a room → secure form with
  password → contract → sign → fake pay → back to chat with the confirmation
  → log in → ask about the bill and the electricity quota → register a guest
  → fake pay the guest fee.

# Kos Wisma Anggrek — WhatsApp rental assistant

A deployable Next.js app for a student boarding house in Indonesia:

- **Public website** that doubles as the assistant's information source
- **WhatsApp assistant** (Claude Haiku) that sells rooms and serves current tenants
- **Secure application flow**: personal details → contract → digital signature → payment
- **Owner dashboard** with contracts, invoices, complaints and guest registrations
- **Automatic owner alerts** by email and WhatsApp whenever a contract is signed and paid

The AI talks. The database decides. Prices, availability, totals and payment
status are always read from or written by server code — the model can request
them but never invent them.

---

## 1. What you need before starting

| Thing | Where | Time |
|---|---|---|
| Meta Business verification | business.facebook.com | days to weeks — **start this first** |
| WhatsApp Cloud API number | Meta app → WhatsApp | 1 hour (number must not be on WhatsApp personal or Business app) |
| Anthropic API key | platform.claude.com | minutes |
| Xendit account | xendit.co | 1–3 days for activation |
| Postgres 14+ | your VPS, Neon, Supabase, or Railway | minutes |
| A domain with HTTPS | anywhere | minutes |

---

## 2. Local setup

```bash
npm install
cp .env.example .env
```

Generate the three secrets and paste them into `.env`:

```bash
openssl rand -hex 32   # ENCRYPTION_KEY
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 32   # CRON_SECRET
```

> **ENCRYPTION_KEY protects every stored KTP number.** Back it up somewhere
> safe. If you lose it, the ID numbers are unrecoverable. If you change it,
> existing records stop decrypting.

Then:

```bash
npx prisma migrate dev --name init   # creates the tables
npm run db:seed                      # rooms, fees, facilities, FAQ
npm run dev                          # http://localhost:3000
```

Edit `prisma/seed.ts` with your real rooms and prices, or change them in the
database later. The website and the assistant both read these same rows.

---

## 2a. Develop on the website first (no WhatsApp, no Xendit)

Only these are needed: Postgres, the three generated secrets, `ADMIN_PASSWORD`,
`OWNER_EMAIL` and `ANTHROPIC_API_KEY`. Leave every `WA_*`, `OWNER_PHONE_E164`,
`XENDIT_*` and `RESEND_API_KEY` value blank.

- The chat bubble on every page is the assistant (Claude, model `claude-haiku-5-5`).
- Without Xendit, every "Bayar" button opens `/dev/pay/<invoice>` with
  **Simulasikan bayar** — it runs the same code a real payment does. This page
  does not exist in production, and production refuses to start without Xendit.
- Owner alerts appear on the dashboard; they are also emailed once
  `RESEND_API_KEY` is set and sent on WhatsApp once WhatsApp is connected.
- All property data and photos: **/admin → Data kos**. Chats: **/admin → Percakapan**.
- Renters log in at `/masuk` with the phone number and password they chose on
  the sign-up form. "Lupa password": dashboard → Penghuni aktif → *Buat link atur password*.

Tests use a separate database (`TEST_DATABASE_URL`) so they never touch your real data: `npm test`.

**Adding WhatsApp later:** fill in every `WA_*` value plus `WA_BOT_PHONE_E164`
and `OWNER_PHONE_E164`, run `npm run wa:templates`, and point Meta's webhook at
`/api/whatsapp/webhook`. The same assistant, rules and guardrails answer there.

---

## 3. Connect WhatsApp

1. In the Meta app dashboard, add the **WhatsApp** product and copy:
   - `WA_PHONE_NUMBER_ID` (Phone number ID)
   - `WA_BUSINESS_ACCOUNT_ID` (WhatsApp Business Account ID)
   - `WA_APP_SECRET` (App settings → Basic → App secret)
2. Create a **permanent** token: Business settings → System users → add a
   system user with the WhatsApp app assigned → Generate token with
   `whatsapp_business_messaging` and `whatsapp_business_management`. Put it in
   `WA_ACCESS_TOKEN`. A temporary token expires in 24 hours.
3. Set `WA_VERIFY_TOKEN` to any random string.
4. Deploy (section 5), then in Meta: **WhatsApp → Configuration → Webhook**
   - Callback URL: `https://your-domain.com/api/whatsapp/webhook`
   - Verify token: the same `WA_VERIFY_TOKEN`
   - Subscribe to the **messages** field.
5. Register the templates:

```bash
npm run wa:templates
```

### The 24-hour window, in one paragraph

When someone messages you, a 24-hour window opens and your free-form replies
cost nothing. Outside that window you may only send pre-approved templates,
which are billed per message. So the assistant answers freely while a
conversation is live, and every proactive nudge (rent reminder, receipt, owner
alert) goes out as a template. **Check Meta's current rate card before you
budget** — the rules around in-window utility templates changed in late 2026.

---

## 4. Connect Xendit

1. Dashboard → Settings → API keys → create a secret key → `XENDIT_SECRET_KEY`.
2. Settings → Webhooks → set the **Invoices paid** callback URL to
   `https://your-domain.com/api/xendit/webhook`, and copy the **verification
   token** into `XENDIT_WEBHOOK_TOKEN`.
3. Test in sandbox first. Use test mode keys until the whole flow works.

Fees to expect: virtual account is a flat ~Rp4.000, QRIS ~0.63%, e-wallets
1.5%+ and cards 2.9% + Rp2.000, all excluding 11% VAT. For rent, virtual
account is far the cheapest; yearly payments exceed QRIS transaction limits
anyway.

---

## 5. Deploy

### Option A — your own VPS (recommended for data residency)

A 2 GB Jakarta VPS (Biznet, idCloudHost, Contabo) is plenty.

```bash
git clone <your repo> kos-bot && cd kos-bot
cp .env.example .env     # fill it in, set POSTGRES_PASSWORD too
docker compose up -d --build
```

This runs three containers: Postgres, the app, and a cron loop that purges
chat memory hourly and runs the rent cycle. Migrations run on boot.

Put Caddy or nginx in front for HTTPS. Caddy is two lines:

```
kos.example.com {
  reverse_proxy localhost:3000
}
```

Back up two things: the Postgres volume, and `/app/storage` (KTP photos and
signed contracts).

### Option B — Vercel + a managed database

```bash
vercel --prod
```

Add every variable from `.env.example` in the Vercel dashboard. `vercel.json`
already schedules both cron jobs; Vercel sends `CRON_SECRET` as a bearer token
automatically. Use Neon, Supabase or Railway for Postgres, and set
`STORAGE_DRIVER=s3` with Cloudflare R2 — Vercel's filesystem is not persistent.

---

## 6. Security model

| Risk | What stops it |
|---|---|
| Someone impersonating a tenant | A matching phone number is not enough. Account data unlocks only after a single-use, 10-minute verification link. |
| Prompt injection reading another account | Tools take no tenant ID. The server fills it in from the verified contact, so there is nothing for the model to override. |
| Prospects reaching tenant tools | Those tools are not in the tool list for non-members at all. |
| A leaked database dump | KTP numbers are AES-256-GCM encrypted with a key that lives only in the environment. |
| KTP photos leaking | Stored in private storage, served only through an owner-authenticated route, and every read is written to the audit log. |
| KTP photos arriving in chat | Media messages are refused with a pointer to the secure form. |
| Forged webhooks | Meta's HMAC signature and Xendit's callback token are both verified before anything is parsed. |
| Double-charging on retries | Every webhook is deduplicated by message or event ID, and payments are unique on the gateway reference. |
| Token-burning abuse | 12 messages per minute and 120 per day per number, enforced in the database. |
| The bot inventing a price | Every number comes from a tool result. The rules forbid stating anything a tool did not return. |

### Legal (Indonesia)

UU No. 27/2022 (PDP) treats KTP numbers and photos as personal data. This repo
gives you encryption at rest, a stated retention period, a consent clause in
the contract, access logging, and automatic deletion of documents 12 months
after a lease ends. **Have a lawyer review the contract and your privacy
notice before launch**, and register the service with Komdigi as a PSE.

---

## 7. Data retention, as implemented

| Data | Kept |
|---|---|
| Prospect contact + chat | Deleted 24 hours after their last message |
| Tenant chat history | 90 days |
| Tenant account, lease, invoices | Life of the tenancy + accounting needs |
| KTP photos and signed contracts | Deleted 12 months after the lease ends |
| Audit log | Kept — it is your evidence trail |

The hourly purge job enforces all of this. A prospect's history older than 24
hours is never fed back into a prompt, even if the job is late.

---

## 8. Running costs

For ~20 rooms and ~2,500 bot replies a month, expect roughly **Rp0,9–2,5
juta/month**: Claude Haiku ~Rp375rb (prompt caching keeps the static rules
block nearly free after the first call), WhatsApp templates ~Rp120rb, hosting
Rp150–750rb, plus payment fees per transaction. The dashboard shows your
actual 30-day AI spend, computed from real token counts.

---

## 9. Project map

```
prisma/schema.prisma          database: contacts, tenants, rooms, leases, invoices, chat
prisma/seed.ts                your rooms, fees, facilities, FAQ

src/lib/chat/context.ts       who is texting; 24h prospect memory vs 90d member memory
src/lib/chat/rules.ts         the assistant's standing instructions (static, cacheable)
src/lib/chat/tools.ts         everything the AI can actually do
src/lib/chat/assistant.ts     the tool-use loop

src/lib/crypto.ts             AES-256-GCM, tokens, session signing, masking
src/lib/billing.ts            invoices; amounts always originate here
src/lib/contract.ts           contract wording, integrity hash, signed PDF
src/lib/jobs.ts               purge + rent cycle
src/lib/notify.ts             owner email and WhatsApp alerts

src/app/page.tsx                            public website
src/app/apply/[token]/                      secure application flow
src/app/admin/                              owner dashboard
src/app/p/[code]/route.ts                   short, stable pay links
src/app/api/whatsapp/webhook/route.ts       inbound messages
src/app/api/xendit/webhook/route.ts         payments → tenant, lease, owner alert
src/app/api/cron/*                          scheduled jobs
```

---

## 10. Suggested launch order

1. Deploy with a **test** WhatsApp number and Xendit sandbox keys.
2. Walk the full flow yourself: ask about rooms → apply → sign → pay. Confirm
   the tenant, lease and owner alert all appear.
3. Try to break it: ask for a discount, claim to be another tenant, paste
   "ignore your instructions", send a photo. Read the audit log afterwards.
4. Put three real rooms in and invite five students.
5. Switch to live keys only once step 2 passes end to end.

Keep `handoff_to_human` generous at first. A bot that fetches you early is
better than one that confidently gets a tenancy wrong.

# Putting the website online with Render

For: the project owner / developer. Uses `render.yaml` at the repository root.

## What gets created (Singapore)

| Render item | Name | Plan | What it is |
|---|---|---|---|
| Web service | `roemahkoe` | Starter | The website, admin and chat. Has a 1 GB private disk for photos, KTP scans and contracts. |
| Postgres | `roemahkoe-db` | Basic 256 MB | The database. |
| Cron job | `roemahkoe-reminders` | Starter | Every day 09:30 WIB: rent invoices and reminders. |
| Cron job | `roemahkoe-purge` | Starter | Every hour: deletes expired chats and documents. |

Expect roughly US$15–20 per month in total (check Render's pricing page; it changes).

## Steps

1. **Sign up** at render.com with your GitHub account and add a payment card (Render → Account → Billing).
2. **Push the code** to GitHub (`main` of `bendarrelj-beep/chatbotDEMO`). Claude does this once you approve.
3. In Render: **New → Blueprint**, choose the `chatbotDEMO` repository, branch `main`. Render reads `render.yaml` and lists the four items above.
4. Render asks for the values marked `sync: false`:
   - `APP_URL`: `https://roemahkoe.onrender.com` (the address Render shows for the web service; if the name is taken it adds letters — use exactly what Render shows). Later, your own domain.
   - `ENCRYPTION_KEY`: copy the line from `~/Documents/roemahkoe-secrets/render-encryption-key.txt`. **Keep this file safe:** without it, the encrypted KTP numbers in the database can never be read again.
   - `ADMIN_PASSWORD`: the owner's dashboard password (at least 10 characters, not used anywhere else).
   - `OWNER_EMAIL`, `OWNER_NAME`: the owner's real email and name (the dashboard login).
   - `ANTHROPIC_API_KEY`: the key from console.anthropic.com (for the chat assistant).
   Press **Apply**. The first build takes a few minutes. The pre-deploy step creates the database tables.
5. **Fill the database once.** Web service `roemahkoe` → **Shell** → run:
   ```sh
   npx tsx prisma/seed.ts
   ```
   This adds the settings, the seven room types, demo rooms and demo renters.
6. **Photos.** The owner's photos are not in git, so upload them in the dashboard: log in at `<APP_URL>/admin/login` → Data kos → **Tipe kamar** → each type → upload its photos (first one becomes the cover).
7. **Check** the site at `APP_URL`: Beranda, Kamar, a type page, the chat.

## Before real renters

- **Payments:** online payment needs Xendit keys (`XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN`) added in Render → `roemahkoe` → Environment. Without them, the rent form stops at payment. (The test payment page is switched off on the live site on purpose.)
- **Demo renters:** before real renters, run `npx tsx prisma/clear-demo.ts` in the Shell (removes only the "Penghuni Demo" renters). Until then the daily job may create invoices for demo renters; they only appear in the dashboard.
- **WhatsApp:** add the `WA_*` values only after the demo renters are cleared.
- **Own domain:** Render → `roemahkoe` → Settings → Custom Domains → add it, set the DNS records Render shows at your domain provider, then change `APP_URL` to `https://your-domain` and redeploy.
- **Backups:** Render backs up paid Postgres daily. Download a copy now and then (Render → `roemahkoe-db` → Backups).

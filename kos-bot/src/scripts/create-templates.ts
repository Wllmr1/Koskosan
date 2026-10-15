/**
 * Registers the message templates with Meta.
 *
 * Templates are only needed OUTSIDE the 24-hour customer service window —
 * rent reminders, receipts and owner alerts. Ordinary replies while someone is
 * chatting need no template at all.
 *
 * Run once:  npm run wa:templates
 * Approval usually takes minutes to a day. Check status in Meta Business
 * Manager under WhatsApp Manager → Message templates.
 */
import { env } from "../env";

type Template = {
  name: string;
  category: "UTILITY" | "MARKETING";
  components: unknown[];
};

const PAY_URL = `${process.env.APP_URL ?? "https://example.com"}/p/{{1}}`;

const TEMPLATES: Template[] = [
  {
    name: "rent_due_reminder",
    category: "UTILITY",
    components: [
      { type: "BODY",
        text: "Halo kak {{1}} 👋 Sewa kamar {{2}} sebesar {{3}} jatuh tempo {{4}}. Bisa dibayar lewat tombol di bawah ya.",
        example: { body_text: [["Rina", "B-204", "Rp1.850.000", "5 November 2026"]] } },
      { type: "FOOTER", text: "Kos Wisma Anggrek" },
      { type: "BUTTONS",
        buttons: [{ type: "URL", text: "Bayar sekarang", url: PAY_URL, example: [`${process.env.APP_URL}/p/INV-RENT-2611-0007`] }] },
    ],
  },
  {
    name: "rent_overdue",
    category: "UTILITY",
    components: [
      { type: "BODY",
        text: "Halo kak {{1}}, sewa kamar {{2}} sebesar {{3}} sudah lewat {{4}} hari dari jatuh tempo. Mohon segera diselesaikan ya 🙏",
        example: { body_text: [["Rina", "B-204", "Rp1.850.000", "3"]] } },
      { type: "FOOTER", text: "Kos Wisma Anggrek" },
      { type: "BUTTONS",
        buttons: [{ type: "URL", text: "Bayar sekarang", url: PAY_URL, example: [`${process.env.APP_URL}/p/INV-RENT-2611-0007`] }] },
    ],
  },
  {
    name: "payment_received",
    category: "UTILITY",
    components: [
      { type: "BODY",
        text: "Pembayaran {{1}} untuk {{2}} sudah kami terima ✅ Terima kasih kak {{3}}!",
        example: { body_text: [["Rp1.850.000", "sewa Oktober", "Rina"]] } },
    ],
  },
  {
    name: "guest_approved",
    category: "UTILITY",
    components: [
      { type: "BODY",
        text: "Tamu {{1}} sudah terdaftar untuk {{2}} malam mulai {{3}}. Mohon tetap jaga jam tamu ya kak 🙏",
        example: { body_text: [["Budi Santoso", "2", "21 September 2026"]] } },
    ],
  },
  {
    name: "ticket_update",
    category: "UTILITY",
    components: [
      { type: "BODY",
        text: "Update keluhan {{1}}: {{2}}. Kalau masih ada kendala, balas pesan ini ya kak.",
        example: { body_text: [["TKT-1042", "teknisi datang besok pagi"]] } },
    ],
  },
  {
    name: "owner_alert",
    category: "UTILITY",
    components: [
      { type: "BODY",
        text: "{{1}}\n\n{{2}}",
        example: { body_text: [["Kontrak baru ditandatangani", "Kamar B-206 dibayar Rp3.700.000 oleh Andi."]] } },
      { type: "FOOTER", text: "Notifikasi otomatis" },
    ],
  },
];

async function main() {
  const e = env();
  if (!e.WA_BUSINESS_ACCOUNT_ID) {
    throw new Error("Set WA_BUSINESS_ACCOUNT_ID in .env first (WhatsApp Business Account ID, not the phone number ID).");
  }

  for (const template of TEMPLATES) {
    const res = await fetch(
      `https://graph.facebook.com/${e.WA_GRAPH_VERSION}/${e.WA_BUSINESS_ACCOUNT_ID}/message_templates`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${e.WA_ACCESS_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...template, language: "id", allow_category_change: true }),
      }
    );
    const json = await res.json();
    console.log(res.ok ? `✓ ${template.name}` : `✗ ${template.name}: ${JSON.stringify(json).slice(0, 300)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import type Anthropic from "@anthropic-ai/sdk";
import {
  ApplicationStatus,
  Channel,
  ContactType,
  InvoiceKind,
  InvoiceStatus,
  LeasePlan,
  RoomStatus,
  TicketStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { encrypt, maskId, newToken } from "@/lib/crypto";
import { addDays, firstOfMonth, niceDate, normalizePhone, rp, wibNow } from "@/lib/money";
import { createLocalInvoice, lateFeeFor } from "@/lib/billing";
import { LIMITS, overLimit } from "@/lib/rate-limit";
import { notifyOwner } from "@/lib/notify";
import { startHandoff, type ChatCtx } from "./context";
import { addAction } from "./actions";

export type ToolDef = {
  name: string;
  description: string;
  input_schema: Anthropic.Tool.InputSchema;
  /** ctx is supplied by the server. The model can never choose whose data it touches. */
  run: (input: Record<string, unknown>, ctx: ChatCtx) => Promise<unknown>;
  membersOnly?: boolean;
  /** Channels this tool is offered on. Default: every channel. */
  channels?: Channel[];
  /** Offered only to people who are not verified renters. */
  prospectsOnly?: boolean;
  /** Short line shown while the tool runs, if you ever stream progress. */
  progress?: string;
};

/* ────────────────────────── helpers ────────────────────────── */

const str = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const int = (v: unknown) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : NaN;
};

async function settings() {
  return prisma.propertySetting.findUniqueOrThrow({ where: { id: "default" } });
}

function requireVerified(ctx: ChatCtx): asserts ctx is ChatCtx & { tenantId: string } {
  if (!ctx.verified || !ctx.tenantId) {
    throw new Error(
      "NOT_VERIFIED: this person has not confirmed they own this account. Call send_verification_link and share nothing."
    );
  }
}

async function activeLease(tenantId: string) {
  return prisma.lease.findFirst({
    where: { tenantId, status: "ACTIVE" },
    include: { room: true },
    orderBy: { createdAt: "desc" },
  });
}

async function audit(ctx: ChatCtx, action: string, meta?: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: { actor: "bot", action, contactId: ctx.contactId, tenantId: ctx.tenantId, meta: (meta ?? {}) as never },
  });
}

/* ────────────────────────── tools ────────────────────────── */

export const TOOLS: ToolDef[] = [
  {
    name: "remember_name",
    progress: "Menyimpan nama…",
    description:
      "Save the name the person just told you so you can greet them by it later. Call this once, right after they introduce themselves. Do not ask twice.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string", description: "The name they gave, as they wrote it" } },
      required: ["name"],
    },
    async run(input, ctx) {
      const clean = str(input.name, 60).replace(/[^\p{L}\p{M}\s'.-]/gu, "").trim();
      if (clean.length < 2) throw new Error("That does not look like a name. Ask again politely.");
      if (ctx.type === ContactType.MEMBER) {
        return { saved: false, note: "Renter names come from the signed contract, not from chat." };
      }
      await prisma.contact.update({ where: { id: ctx.contactId }, data: { displayName: clean } });
      return { saved: true, name: clean };
    },
  },

  {
    name: "search_rooms",
    progress: "Mengecek ketersediaan kamar…",
    description:
      "Search the live room list. Returns room code, type, size, floor, monthly price, bathroom, extras, status and move-in date. This is the only source of truth for availability and price — never quote a room from memory.",
    input_schema: {
      type: "object",
      properties: {
        max_price: { type: "integer", description: "Budget ceiling per month in Rupiah, e.g. 1500000" },
        type: { type: "string", description: "Room type filter, or omit for all" },
        only_available: { type: "boolean", description: "Default true. Set false to include occupied rooms." },
      },
    },
    async run(input, ctx) {
      const maxPrice = input.max_price !== undefined ? int(input.max_price) : undefined;
      const onlyAvailable = input.only_available !== false;
      const rooms = await prisma.room.findMany({
        where: {
          hidden: false,
          ...(input.type ? { type: { equals: str(input.type, 40), mode: "insensitive" } } : {}),
          ...(maxPrice && Number.isFinite(maxPrice) ? { monthlyPrice: { lte: maxPrice } } : {}),
          ...(onlyAvailable ? { status: RoomStatus.AVAILABLE } : {}),
        },
        orderBy: [{ monthlyPrice: "asc" }, { sortOrder: "asc" }],
        take: 8,
      });

      const totalAvailable = await prisma.room.count({ where: { status: RoomStatus.AVAILABLE, hidden: false } });
      const results = rooms.map((r) => ({
        room: r.code,
        type: r.type,
        size: r.sizeLabel,
        floor: r.floor,
        price_per_month: rp(r.monthlyPrice),
        bathroom: r.bathroom,
        extras: r.extras,
        status: r.status,
        move_in: r.availableOn ? niceDate(r.availableOn) : "bisa sekarang",
      }));

      if (!results.length) {
        const fallback = await prisma.room.findMany({
          where: { status: RoomStatus.AVAILABLE, hidden: false },
          orderBy: { monthlyPrice: "asc" },
          take: 3,
        });
        return {
          results: [],
          note: "Nothing matched. Offer these instead and be honest that they are above the budget.",
          cheapest_available: fallback.map((r) => ({ room: r.code, type: r.type, price_per_month: rp(r.monthlyPrice) })),
        };
      }
      for (const r of rooms.slice(0, 3)) addAction(ctx, `Foto ${r.code}`, `/kamar/${encodeURIComponent(r.code)}`);
      return { results, total_available: totalAvailable };
    },
  },

  {
    name: "get_property_info",
    progress: "Membuka info kos…",
    description:
      "Read the published property information: fees, payment terms, facilities, paid services, guest rules, house rules, nearby places, address and FAQ. Use this for every factual question instead of answering from memory. Returns the exact published wording.",
    input_schema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          enum: [
            "fees",
            "payment_terms",
            "facilities",
            "services",
            "guest_rules",
            "house_rules",
            "nearby",
            "location",
            "faq",
          ],
        },
      },
      required: ["topic"],
    },
    async run(input) {
      const topic = str(input.topic, 30);
      const s = await settings();

      switch (topic) {
        case "fees": {
          const rooms = await prisma.room.findMany({
            where: { hidden: false },
            distinct: ["type"],
            orderBy: { monthlyPrice: "asc" },
            select: { type: true, monthlyPrice: true },
          });
          return {
            topic,
            room_prices: rooms.map((r) => `${r.type}: ${rp(r.monthlyPrice)} per bulan`),
            deposit: `${s.depositMonths}× sewa bulanan, dikembalikan maksimal ${s.depositReturnDays} hari setelah keluar`,
            yearly_deal: `Bayar tahunan: ${s.yearlyMonths} bulan untuk 12 bulan sewa`,
            electricity: `Kuota ${s.electricQuota} kWh/bulan termasuk. Kelebihan ${rp(s.electricRate)}/kWh.`,
            water_and_wifi: s.utilitiesNote,
            guest_fee: `${rp(s.guestFeePerNight)} per malam per tamu, maksimal ${s.maxGuestNights} malam berturut-turut`,
            late_fee: `${rp(s.lateFeePerDay)}/hari setelah tanggal ${s.dueDayOfMonth}, maksimal ${rp(s.lateFeeMax)}`,
          };
        }
        case "payment_terms":
          return { topic, info: s.paymentTerms, due_day: s.dueDayOfMonth, minimum_months: s.minMonths };
        case "facilities":
          return { topic, info: s.facilities };
        case "services": {
          const rows = await prisma.service.findMany({ orderBy: { sortOrder: "asc" } });
          return { topic, info: rows.map((r) => `${r.name}: ${r.priceNote}`) };
        }
        case "guest_rules":
          return {
            topic,
            info: s.guestRules,
            fee_per_night: rp(s.guestFeePerNight),
            register_before: `${s.guestCutoffHour}.00 WIB`,
            max_nights: s.maxGuestNights,
            max_guests_at_once: s.maxGuestsAtOnce,
          };
        case "house_rules":
          return { topic, info: s.houseRules };
        case "nearby": {
          const rows = await prisma.nearbyPlace.findMany({ orderBy: { sortOrder: "asc" } });
          return { topic, info: rows.map((r) => `${r.name}: ${r.distance}`) };
        }
        case "location":
          return { topic, name: s.name, address: s.address, maps: s.mapsUrl ?? undefined };
        case "faq": {
          const rows = await prisma.faqEntry.findMany({ orderBy: { sortOrder: "asc" } });
          return { topic, info: rows.map((r) => ({ q: r.question, a: r.answer })) };
        }
        default:
          throw new Error("Unknown topic.");
      }
    },
  },

  {
    name: "start_application",
    progress: "Membuat tautan aman…",
    description:
      "Send the secure application link for one available room. The person fills in their details, reads and signs the contract, then pays — all on the secure page, never in chat. Call this only after they have chosen a specific room and know its price. Returns the reference.",
    input_schema: {
      type: "object",
      properties: {
        room_code: { type: "string", description: "Exact room code from search_rooms, e.g. B-206" },
        plan: { type: "string", enum: ["bulanan", "tahunan"], description: "Monthly or yearly payment" },
      },
      required: ["room_code"],
    },
    async run(input, ctx) {
      const code = str(input.room_code, 20).toUpperCase();
      const room = await prisma.room.findUnique({ where: { code } });
      if (!room || room.hidden) throw new Error(`No room called ${code}. Call search_rooms and offer a real one.`);
      if (room.status !== RoomStatus.AVAILABLE) {
        throw new Error(`Room ${room.code} is ${room.status.toLowerCase()}. Offer an available room instead.`);
      }
      if (await overLimit("apply", ctx.contactId, 5, 3_600_000)) {
        throw new Error("Too many application links already sent to this person in the last hour.");
      }

      const plan = str(input.plan, 10) === "tahunan" ? LeasePlan.YEARLY : LeasePlan.MONTHLY;
      const { raw, hash } = newToken();
      const count = await prisma.application.count();
      const reference = `APP-${String(1000 + count + 1)}`;

      await prisma.application.create({
        data: {
          reference,
          tokenHash: hash,
          contactId: ctx.contactId,
          roomId: room.id,
          plan,
          expiresAt: new Date(Date.now() + 48 * 3_600_000),
        },
      });

      addAction(ctx, "Buka formulir", `/apply/${raw}`);
      await audit(ctx, "tool:start_application", { reference, room: room.code, plan });

      return {
        reference,
        room: room.code,
        plan: plan === LeasePlan.YEARLY ? "tahunan" : "bulanan",
        link_sent: true,
        steps: "data diri, baca kontrak, tanda tangan digital, lalu pembayaran",
        note: "A 'Buka formulir' button is attached to your reply. Say which room and price it is for and that the link works for 48 hours. Never ask for KTP, ID number or date of birth in the chat.",
      };
    },
  },

  {
    name: "send_verification_link",
    channels: [Channel.WHATSAPP],
    prospectsOnly: true,
    progress: "Mengirim tautan verifikasi…",
    description:
      "Send a one-time link that confirms this WhatsApp number really belongs to the renter. Use it when someone on a registered number asks about their account but is not verified yet.",
    input_schema: { type: "object", properties: {} },
    async run(_input, ctx) {
      if (ctx.type !== ContactType.MEMBER) throw new Error("This number is not registered to any renter.");
      if (ctx.verified) return { already_verified: true };
      if (await overLimit("verify", ctx.contactId, LIMITS.verifyLinks.limit, LIMITS.verifyLinks.windowMs)) {
        throw new Error("Too many verification links requested. Ask them to wait 15 minutes.");
      }

      const { raw, hash } = newToken();
      await prisma.verifyToken.create({
        data: { contactId: ctx.contactId, tokenHash: hash, expiresAt: new Date(Date.now() + 10 * 60_000) },
      });
      addAction(ctx, "Verifikasi akun", `/verify/${raw}`);
      await audit(ctx, "tool:send_verification_link");
      return { sent: true, expires_in: "10 menit" };
    },
  },

  {
    name: "prompt_login",
    channels: [Channel.WEB],
    prospectsOnly: true,
    progress: "Menyiapkan tombol masuk…",
    description:
      "Website only. Attach a 'Masuk' button to the renter login page. Use when someone says they already rent here and asks about their own bill, due date, electricity quota, complaint or guests. Share no account details until they are logged in.",
    input_schema: { type: "object", properties: {} },
    async run(_input, ctx) {
      addAction(ctx, "Masuk", "/masuk");
      return { button: "Masuk", note: "Tell them to log in with their phone number and password, then ask again here." };
    },
  },

  {
    name: "get_my_account",
    membersOnly: true,
    progress: "Membuka akun…",
    description:
      "The verified renter's own room, plan, rent, contract end date, every unpaid invoice with how much is left and when it is due, any late fee accrued, and the total owed. Use this for every 'how much do I owe' or 'when is rent due' question.",
    input_schema: { type: "object", properties: {} },
    async run(_input, ctx) {
      requireVerified(ctx);
      const lease = await activeLease(ctx.tenantId);
      if (!lease) return { active_lease: false, note: "No active lease. Offer to connect them to the owner." };

      const s = await settings();
      const invoices = await prisma.invoice.findMany({
        where: { leaseId: lease.id, status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL] } },
        orderBy: { dueDate: "asc" },
      });

      const now = new Date();
      const open = invoices.map((inv) => {
        const late = lateFeeFor(inv.dueDate, s.lateFeePerDay, s.lateFeeMax, now);
        return {
          invoice: inv.code,
          what: inv.description,
          amount: rp(inv.amount),
          already_paid: rp(inv.amountPaid),
          remaining: rp(inv.amount - inv.amountPaid),
          due_date: niceDate(inv.dueDate),
          overdue: inv.dueDate < now,
          late_fee_so_far: late > 0 ? rp(late) : undefined,
        };
      });

      const owed = invoices.reduce((sum, i) => sum + (i.amount - i.amountPaid), 0);
      await audit(ctx, "tool:get_my_account", { invoices: invoices.length });

      return {
        account_id: ctx.accountCode,
        name: ctx.name,
        room: lease.room.code,
        room_type: lease.room.type,
        plan: lease.plan === LeasePlan.YEARLY ? "tahunan" : "bulanan",
        monthly_rent: rp(lease.monthlyRent),
        contract_period: `${niceDate(lease.startDate)} sampai ${niceDate(lease.endDate)}`,
        rent_due_day: `tanggal ${s.dueDayOfMonth} tiap bulan`,
        deposit_held: rp(lease.deposit),
        total_owed: rp(owed),
        open_invoices: open,
      };
    },
  },

  {
    name: "get_my_utility_quota",
    membersOnly: true,
    progress: "Mengecek kuota listrik…",
    description:
      "This month's electricity reading for the verified renter's room: kWh used, the included quota, kWh remaining, the overage rate and the estimated extra charge so far.",
    input_schema: { type: "object", properties: {} },
    async run(_input, ctx) {
      requireVerified(ctx);
      const lease = await activeLease(ctx.tenantId);
      if (!lease) return { active_lease: false };

      const period = firstOfMonth();
      const reading = await prisma.utilityPeriod.findUnique({
        where: { roomId_period: { roomId: lease.roomId, period } },
      });
      if (!reading) {
        const s = await settings();
        return {
          note: "Belum ada pencatatan meteran bulan ini.",
          quota_kwh: s.electricQuota,
          rate_per_extra_kwh: rp(s.electricRate),
        };
      }

      const used = Number(reading.usedKwh);
      const over = Math.max(0, used - reading.quotaKwh);
      await audit(ctx, "tool:get_my_utility_quota");

      return {
        room: lease.room.code,
        period: reading.period.toISOString().slice(0, 7),
        used_kwh: used,
        quota_kwh: reading.quotaKwh,
        remaining_kwh: Math.max(0, reading.quotaKwh - used),
        rate_per_extra_kwh: rp(reading.ratePerKwh),
        estimated_extra_charge: rp(Math.round(over * reading.ratePerKwh)),
        utilities: (await settings()).utilitiesNote,
        last_updated: niceDate(reading.updatedAt),
      };
    },
  },

  {
    name: "create_payment",
    membersOnly: true,
    progress: "Membuat tagihan…",
    description:
      "Send a payment button for one existing invoice. Use an invoice code you got from get_my_account or register_guest. The amount comes from the invoice — you can never set it yourself.",
    input_schema: {
      type: "object",
      properties: { invoice_code: { type: "string", description: "Exact invoice code, e.g. INV-RENT-2610-0004" } },
      required: ["invoice_code"],
    },
    async run(input, ctx) {
      requireVerified(ctx);
      const code = str(input.invoice_code, 40).toUpperCase();

      // Scoped to this tenant: an invoice belonging to someone else is simply not found.
      const invoice = await prisma.invoice.findFirst({
        where: {
          code,
          OR: [{ lease: { tenantId: ctx.tenantId } }, { guestStay: { tenantId: ctx.tenantId } }],
        },
      });
      if (!invoice) throw new Error("No such invoice on this account. Call get_my_account first.");
      if (invoice.status === InvoiceStatus.PAID) return { invoice: invoice.code, status: "sudah lunas" };

      addAction(ctx, "Bayar sekarang", `/p/${invoice.code}`);
      await audit(ctx, "tool:create_payment", { invoice: invoice.code });

      return {
        invoice: invoice.code,
        amount: rp(invoice.amount - invoice.amountPaid),
        button: "Bayar sekarang",
        methods: "QRIS, virtual account, e-wallet",
        note: "The payment button is attached to your reply.",
      };
    },
  },

  {
    name: "register_guest",
    membersOnly: true,
    progress: "Mendaftarkan tamu…",
    description:
      "Register an overnight guest for the verified renter. Collect the guest's full name, phone number, KTP number, check-in date and number of nights first. The fee is calculated by the system and an invoice is sent. The guest is only approved once that invoice is paid.",
    input_schema: {
      type: "object",
      properties: {
        guest_name: { type: "string", description: "Guest's full name" },
        guest_phone: { type: "string", description: "Guest's phone number" },
        guest_id_number: { type: "string", description: "Guest's 16-digit KTP number" },
        check_in: { type: "string", description: "Check-in date, YYYY-MM-DD" },
        nights: { type: "integer", description: "Number of consecutive nights" },
      },
      required: ["guest_name", "guest_phone", "guest_id_number", "check_in", "nights"],
    },
    async run(input, ctx) {
      requireVerified(ctx);
      const s = await settings();
      const lease = await activeLease(ctx.tenantId);
      if (!lease) throw new Error("No active lease on this account.");

      const name = str(input.guest_name, 80);
      if (name.split(/\s+/).filter(Boolean).length < 2) throw new Error("Need the guest's full name, not just one word.");

      const phone = normalizePhone(str(input.guest_phone, 25));
      if (!phone) throw new Error("That guest phone number is not valid. Ask them to send it again.");

      const idDigits = str(input.guest_id_number, 25).replace(/\D/g, "");
      if (idDigits.length !== 16) throw new Error("A KTP number must be exactly 16 digits. Ask them to check it.");

      const nights = int(input.nights);
      if (!(nights >= 1 && nights <= s.maxGuestNights)) {
        throw new Error(`Maximum ${s.maxGuestNights} consecutive nights per guest.`);
      }

      const checkIn = str(input.check_in, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) throw new Error("Check-in date must be YYYY-MM-DD.");
      const now = wibNow();
      if (checkIn < now.date) throw new Error("That date has already passed.");
      if (checkIn === now.date && now.hour >= s.guestCutoffHour) {
        throw new Error(
          `Registration for tonight closed at ${s.guestCutoffHour}.00 WIB. Offer ${addDays(now.date, 1)} instead.`
        );
      }

      // House rule: at most maxGuestsAtOnce guests on any one night. Stays are at
      // most maxGuestNights long, so only stays starting that many days before can overlap.
      // Abandoned registrations (invoice expired or voided) do not count.
      const start = new Date(`${checkIn}T00:00:00Z`);
      const end = new Date(start.getTime() + nights * 86_400_000);
      const nearby = await prisma.guestStay.findMany({
        where: {
          tenantId: ctx.tenantId,
          checkIn: { gte: new Date(start.getTime() - s.maxGuestNights * 86_400_000), lt: end },
          NOT: { invoice: { is: { status: { in: [InvoiceStatus.EXPIRED, InvoiceStatus.VOID] } } } },
        },
        select: { checkIn: true, nights: true },
      });
      const overlapping = nearby.filter((g) => g.checkIn.getTime() + g.nights * 86_400_000 > start.getTime());
      if (overlapping.length >= s.maxGuestsAtOnce) {
        throw new Error(
          `This renter already has ${s.maxGuestsAtOnce} guests registered for some of those nights, the maximum.`
        );
      }

      const fee = nights * s.guestFeePerNight;
      const count = await prisma.guestStay.count();
      const stay = await prisma.guestStay.create({
        data: {
          code: `GST-${String(1000 + count + 1)}`,
          tenantId: ctx.tenantId,
          guestName: name,
          phoneE164: phone,
          idNumberEnc: encrypt(idDigits),
          idLast4: idDigits.slice(-4),
          checkIn: start,
          nights,
          fee,
        },
      });

      const invoice = await createLocalInvoice({
        kind: InvoiceKind.GUEST,
        description: `Tamu menginap ${name} (${nights} malam) — kamar ${lease.room.code}`,
        amount: fee,
        dueDate: new Date(`${checkIn}T00:00:00Z`),
        guestStayId: stay.id,
      });

      addAction(ctx, "Bayar biaya tamu", `/p/${invoice.code}`);
      await audit(ctx, "tool:register_guest", { guest: stay.code, nights });

      return {
        guest_code: stay.code,
        invoice: invoice.code,
        nights,
        fee: rp(fee),
        check_in: niceDate(checkIn),
        id_stored_as: maskId(idDigits),
        button: "Bayar biaya tamu",
        note: "Approved once paid. Never repeat the guest's full ID or phone number back to anyone.",
      };
    },
  },

  {
    name: "file_complaint",
    membersOnly: true,
    progress: "Membuat tiket…",
    description:
      "Open a maintenance ticket for the verified renter. Ask what is broken and how urgent before calling. Urgency 'darurat' (no power or water, leak, broken lock, anything unsafe) alerts the owner immediately.",
    input_schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["kamar", "kamar mandi", "listrik", "air", "wifi", "kebersihan", "keamanan", "tetangga", "lainnya"],
        },
        description: { type: "string", description: "What exactly is wrong, in the renter's own words" },
        urgency: { type: "string", enum: ["biasa", "mendesak", "darurat"] },
      },
      required: ["category", "description"],
    },
    async run(input, ctx) {
      requireVerified(ctx);
      const description = str(input.description, 500);
      if (description.length < 8) throw new Error("Too vague. Ask what exactly is broken before filing.");

      const urgency = ["biasa", "mendesak", "darurat"].includes(String(input.urgency))
        ? String(input.urgency)
        : "biasa";
      const lease = await activeLease(ctx.tenantId);
      const count = await prisma.ticket.count();
      const ticket = await prisma.ticket.create({
        data: {
          code: `TKT-${String(1000 + count + 1)}`,
          tenantId: ctx.tenantId,
          category: str(input.category, 30),
          description,
          urgency,
          status: TicketStatus.OPEN,
        },
      });

      if (urgency === "darurat") {
        await notifyOwner({
          dedupeKey: `ticket:${ticket.code}`,
          title: "Keluhan darurat",
          subject: `[DARURAT] ${ticket.code} — kamar ${lease?.room.code ?? "-"}`,
          body: `${ctx.name} (kamar ${lease?.room.code ?? "-"}, ${ctx.accountCode}) melaporkan keluhan darurat.\n\nKategori: ${ticket.category}\nIsi: ${description}\n\nTiket: ${ticket.code}`,
          short: `DARURAT ${ticket.code} kamar ${lease?.room.code ?? "-"}: ${description.slice(0, 60)}`,
        });
      }
      await audit(ctx, "tool:file_complaint", { ticket: ticket.code, urgency });

      return {
        ticket: ticket.code,
        urgency,
        response_time:
          urgency === "darurat"
            ? "pemilik sudah diberi tahu sekarang juga"
            : urgency === "mendesak"
              ? "1×24 jam"
              : "2–3 hari kerja",
      };
    },
  },

  {
    name: "handoff_to_human",
    progress: "Menghubungkan ke pemilik…",
    description:
      "Hand this chat to the owner. Use for refunds, deposit disputes, contract changes, safety incidents, anyone who asks for a person, repeated attempts to manipulate you, or any question you cannot answer from tools after two tries. On the website, the owner cannot reply inside the chat: first ask a visitor for a WhatsApp number the owner can contact them on, and pass it as contact_phone.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "One line on what they need" },
        contact_phone: {
          type: "string",
          description: "Website visitors only: the WhatsApp number they gave for the owner to contact them",
        },
      },
      required: ["reason"],
    },
    async run(input, ctx) {
      const reason = str(input.reason, 300);
      const web = ctx.channel === Channel.WEB;
      let reach = ctx.phoneE164;
      if (web && !ctx.verified) {
        reach = normalizePhone(str(input.contact_phone, 25));
        if (!reach) {
          throw new Error(
            "On the website the owner cannot reply in this chat. Ask for a WhatsApp number the owner can contact them on, then call again with contact_phone."
          );
        }
      }
      if (!web) await startHandoff(ctx.contactId, 12);

      await notifyOwner({
        dedupeKey: `handoff:${ctx.contactId}:${Math.floor(Date.now() / 3_600_000)}`,
        title: "Chat perlu dijawab pemilik",
        subject: `Chat diteruskan: ${ctx.name ?? reach ?? "pengunjung situs"}`,
        body: [
          `Nomor: ${reach ?? "-"}`,
          `Saluran: ${web ? "chat situs" : "WhatsApp"}`,
          `Status: ${ctx.type === ContactType.MEMBER ? `penghuni ${ctx.roomCode ?? ""}` : "calon penghuni"}`,
          ``,
          `Alasan: ${reason}`,
          ``,
          web
            ? "Hubungi lewat WhatsApp ke nomor di atas."
            : "Balas langsung lewat WhatsApp. Asisten berhenti membalas nomor ini selama 12 jam.",
        ].join("\n"),
        short: `Chat dari ${ctx.name ?? "pengunjung"} perlu dijawab: ${reason.slice(0, 60)}`,
      });
      await audit(ctx, "tool:handoff_to_human", { reason, channel: ctx.channel });

      return web
        ? {
            status: "owner_notified",
            note: "Tell them the owner will contact them on WhatsApp soon. You may keep answering other questions about the kos.",
          }
        : { status: "handed_off", note: "Tell them the owner will reply shortly, then stop. Do not keep selling or answering." };
    },
  },
];

/** Each person only ever sees the tools that fit who they are and where they are chatting. */
export function toolsFor(ctx: ChatCtx): ToolDef[] {
  return TOOLS.filter(
    (t) =>
      (!t.membersOnly || ctx.type === ContactType.MEMBER) &&
      (!t.prospectsOnly || !ctx.verified) &&
      (!t.channels || t.channels.includes(ctx.channel))
  );
}

export function anthropicTools(tools: ToolDef[]): Anthropic.Tool[] {
  return tools.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
}

/** Used by the application flow to close an application out. */
export const APPLICATION_OPEN_STATUSES = [
  ApplicationStatus.DRAFT,
  ApplicationStatus.DETAILS_SUBMITTED,
  ApplicationStatus.SIGNED,
  ApplicationStatus.AWAITING_PAYMENT,
];

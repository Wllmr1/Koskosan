import { NextRequest } from "next/server";
import { backTo, adminPostGuard, auditActor } from "@/lib/admin-guard";
import { billOverage, saveMeterReadings } from "@/lib/meter";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const denied = await adminPostGuard(req);
  if (denied) return denied;

  const form = await req.formData();
  const bulan = String(form.get("bulan") ?? "");
  const m = /^(\d{4})-(\d{2})$/.exec(bulan);
  if (!m) return backTo(req, "/admin/meteran", `error=${encodeURIComponent("Bulan tidak valid")}`);
  const period = new Date(Date.UTC(+m[1], +m[2] - 1, 1));
  const back = (query: string) => backTo(req, "/admin/meteran", `bulan=${bulan}&${query}`);

  try {
    if (form.get("op") === "bill") {
      const { created } = await billOverage(period, await auditActor());
      return back(`billed=${created}`);
    }
    const entries = [...form.entries()]
      .filter(([k, v]) => k.startsWith("kwh_") && String(v).trim() !== "")
      .map(([k, v]) => ({ roomId: k.slice(4), usedKwh: Number(String(v).replace(",", ".")) }));
    await saveMeterReadings(period, entries);
    return back("saved=1");
  } catch (e) {
    return back(`error=${encodeURIComponent((e as Error).message)}`);
  }
}

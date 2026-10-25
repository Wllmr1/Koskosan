"use client";

import { useState } from "react";
import { firstPayment, rp } from "@/lib/money";

/** "Hitung pembayaran pertama": pick a room type, see first month + deposit = total (monthly plan). */
export default function FirstPaymentCalc({
  types,
  depositMonths,
}: {
  types: { name: string; monthlyPrice: number }[];
  depositMonths: number;
}) {
  const [at, setAt] = useState(0);
  const chosen = types[at];
  if (!chosen) return null;
  const pay = firstPayment(chosen.monthlyPrice, depositMonths);

  return (
    <div className="calc">
      <div>
        <h3>Hitung pembayaran pertama.</h3>
        <p style={{ color: "var(--ink-2)" }}>Pilih tipe kamar untuk melihat total yang dibayar saat tanda tangan, dengan bayar bulanan.</p>
        <label className="lbl" htmlFor="ck" style={{ display: "block", marginTop: 18 }}>Tipe kamar</label>
        <select id="ck" value={at} onChange={(e) => setAt(Number(e.target.value))}>
          {types.map((t, i) => (
            <option key={t.name} value={i}>{t.name} · {rp(t.monthlyPrice)}</option>
          ))}
        </select>
      </div>
      <div className="sum" style={{ alignSelf: "end" }} aria-live="polite">
        <div><span>Sewa bulan pertama</span><span>{rp(pay.rent)}</span></div>
        <div><span>Deposit</span><span>{rp(pay.deposit)}</span></div>
        <div className="tot"><span>Total</span><span>{rp(pay.total)}</span></div>
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { TicketStatus } from "@prisma/client";
import { currentRenter } from "@/lib/renter-auth";
import { loadRenterAccount } from "@/lib/renter-account";
import { niceDate, rp } from "@/lib/money";
import OpenChatButton from "@/components/OpenChatButton";
import PayChatButton from "@/components/site/PayChatButton";
import ProofUpload from "@/components/site/ProofUpload";
import { botChatLink } from "@/lib/whatsapp";
import { billPayText } from "@/lib/pay-text";
import type { BillState } from "@/lib/payment-proofs";
import { PageHead, Section } from "@/components/site/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Akun saya", robots: { index: false, follow: false } };

const TICKET: Record<TicketStatus, string> = { OPEN: "Diterima", IN_PROGRESS: "Sedang dikerjakan", RESOLVED: "Selesai" };

const STATE: Record<BillState, { text: string; tone: string }> = {
  due: { text: "Belum dibayar", tone: "pill-warn" },
  late: { text: "Terlambat", tone: "pill-bad" },
  pending: { text: "Sedang diverifikasi", tone: "pill-pend" },
  rejected: { text: "Bukti ditolak", tone: "pill-bad" },
  paid: { text: "Lunas", tone: "pill-ok" },
  closed: { text: "Tidak berlaku", tone: "pill-mute" },
};

/** The renter's own page: room, contract, bills, electricity, payments, guests, complaints. */
export default async function AccountPage() {
  const renter = await currentRenter();
  if (!renter) redirect("/masuk");
  const a = await loadRenterAccount(renter.id);
  const lease = a.lease;
  const ended = lease && (lease.status === "ENDED" || lease.status === "CANCELLED");

  return (
    <>
      <PageHead title={`Halo, ${a.name.split(" ")[0]}`} sub={`Nomor akun ${a.accountCode}`} />

      {lease && lease.status === "PENDING" && (
        <p className="rent-notice saved">
          {lease.roomCode
            ? <>Kamar <b>{lease.roomCode}</b> sudah disimpan untuk kakak mulai {niceDate(lease.startDate)}. Kontrak ditandatangani di kertas saat pindah masuk.</>
            : <>Deposit sudah diverifikasi. Kamar {lease.roomType} disiapkan untuk kakak mulai {niceDate(lease.startDate)}; nomor kamarnya kami beri tahu 7 hari sebelum masuk.</>}
        </p>
      )}

      {a.notices.map((b) => (
        <div key={b.code} className={`due-notice${b.state === "late" ? " late" : ""}`}>
          <div>
            <b>
              {b.state === "late"
                ? `${b.kindLabel}: ${b.description} terlambat ${b.daysLate} hari`
                : `${b.kindLabel}: ${b.description} jatuh tempo ${niceDate(b.dueDate)}`}
            </b>{" "}
            · {rp(b.remaining)}
            {b.rejectReason && <span className="small"> · Bukti sebelumnya ditolak: {b.rejectReason}</span>}
          </div>
          <a className="btn" href={`#${b.code}`}>Bayar</a>
        </div>
      ))}

      <div className="account-top">
        <section className="panel">
          <h2 className="panel-title">Kamar dan kontrak</h2>
          {!lease ? (
            <p className="muted">Belum ada kontrak di akun ini.</p>
          ) : (
            <>
              {ended && <p className="rent-notice">Kontrak ini sudah berakhir.</p>}
              {lease.notStarted && <p className="rent-notice">Kamar siap ditempati mulai {niceDate(lease.startDate)}.</p>}
              <dl className="facts">
                <div><dt>Kamar</dt><dd>{lease.roomCode ? `${lease.roomCode}, ${lease.roomType}` : `${lease.roomType} (nomor kamar menyusul)`}</dd></div>
                {lease.status === "PENDING" && <div><dt>Kontrak</dt><dd>Ditandatangani di kertas saat pindah masuk</dd></div>}
                <div><dt>Sewa</dt><dd>{rp(lease.monthlyRent)} per bulan, {lease.plan === "YEARLY" ? "bayar tahunan" : "bayar bulanan"}</dd></div>
                <div><dt>Masa kontrak</dt><dd>{niceDate(lease.startDate)} sampai {niceDate(lease.endDate)}</dd></div>
                {!ended && !lease.notStarted && <div><dt>Sisa kontrak</dt><dd>{lease.daysLeft} hari</dd></div>}
                <div><dt>Deposit</dt><dd>{rp(lease.deposit)}</dd></div>
                {!ended && (
                  <div>
                    <dt>Mau pindah?</dt>
                    <dd>
                      {lease.noticePassed
                        ? `Batas pemberitahuan (${niceDate(lease.noticeBy)}) sudah lewat. Hubungi pemilik lewat chat soal perpanjangan atau pindahan.`
                        : `Beri tahu paling lambat ${niceDate(lease.noticeBy)}`}
                    </dd>
                  </div>
                )}
              </dl>
              {lease.hasContract && (
                <a className="btn" href="/api/akun/kontrak" style={{ marginTop: 16 }}>Unduh kontrak (PDF)</a>
              )}
            </>
          )}
        </section>

        <section className="panel owed">
          <h2 className="panel-title">Yang perlu dibayar</h2>
          <p className="owed-total">{rp(a.totalOwed)}</p>
          <p className="small muted" style={{ margin: 0 }}>
            {a.totalOwed === 0 ? "Tidak ada tagihan. Terima kasih!" : `Sewa jatuh tempo tanggal ${a.dueDay} tiap bulan.`}
            {a.totalLateFees > 0 && ` Termasuk denda keterlambatan sekitar ${rp(a.totalLateFees)} yang akan ditagih terpisah.`}
          </p>
        </section>
      </div>

      {a.bills.length > 0 && (
        <Section title="Tagihan" sub="Bayar lewat transfer bank: minta nomor rekening ke asisten, lalu kirim bukti transfernya di sini. Dicek pemilik kos dalam 1–2 hari kerja.">
          <div className="bill-list">
            {a.bills.map((b) => (
              <div key={b.code} id={b.code} className="bill-row">
                <div>
                  <span className={`kind-tag kind-${b.kind.toLowerCase()}`}>{b.kindLabel}</span>
                  <strong>{b.description}</strong>
                  <span className="small muted">
                    {b.code} · jatuh tempo {niceDate(b.dueDate)}
                    {b.lateFee > 0 && `, denda sejauh ini ${rp(b.lateFee)}`}
                  </span>
                  {b.rejectReason && <span className="small overdue">Bukti ditolak: {b.rejectReason}</span>}
                </div>
                <span className="bill-amount">{rp(b.remaining)}</span>
                <span className={`pill ${STATE[b.state].tone}`}>{b.state === "late" ? `Terlambat ${b.daysLate} hari` : STATE[b.state].text}</span>
                {b.state !== "pending" && (
                  <div className="bill-pay">
                    <PayChatButton link={botChatLink(billPayText(b.code, b.description))} text={billPayText(b.code, b.description)} />
                    <details>
                      <summary className="btn">Kirim bukti transfer</summary>
                      <ProofUpload action="/api/akun/bukti" fields={{ invoice: b.code }} compact />
                    </details>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {!a.electricity && lease?.notStarted && (
        <Section title="Listrik">
          <p className="muted small">Meteran listrik kamar Anda mulai dicatat setelah pindah masuk pada {niceDate(lease.startDate)}.</p>
        </Section>
      )}

      {a.electricity && (
        <Section title="Listrik bulan ini" sub={`Dicatat ${niceDate(a.electricity.updatedAt)}.`}>
          <div className="meter" role="img" aria-label={`${a.electricity.usedKwh} dari ${a.electricity.quotaKwh} kWh terpakai`}>
            <div className="meter-fill" style={{ width: `${Math.min(100, (a.electricity.usedKwh / Math.max(1, a.electricity.quotaKwh)) * 100)}%` }} data-over={a.electricity.overKwh > 0} />
          </div>
          <p style={{ margin: "10px 0 0" }}>
            {a.electricity.usedKwh} dari {a.electricity.quotaKwh} kWh terpakai.{" "}
            {a.electricity.overKwh > 0
              ? `Lebih ${a.electricity.overKwh} kWh, biaya tambahan ${rp(a.electricity.extraCharge)} (${rp(a.electricity.rate)}/kWh)${
                  a.electricity.billed ? ", sudah ditagih — lihat Tagihan belum lunas di atas." : ", akan ditagih setelah meteran bulan ini ditutup."
                }`
              : `Sisa ${a.electricity.remainingKwh} kWh.`}
          </p>
        </Section>
      )}

      <div className="account-grid">
        <Section title="Riwayat pembayaran">
          {a.payments.length === 0 ? (
            <p className="muted small">Belum ada pembayaran.</p>
          ) : (
            <ul className="plain-list">
              {a.payments.map((p, i) => (
                <li key={i}>
                  <span>{p.description}<span className="small muted">{niceDate(p.paidAt)}</span></span>
                  <strong>{rp(p.amount)}</strong>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Tamu menginap" sub="Daftarkan tamu lewat chat.">
          {a.guests.length === 0 ? (
            <p className="muted small">Belum ada tamu dalam 30 hari terakhir.</p>
          ) : (
            <ul className="plain-list">
              {a.guests.map((g) => (
                <li key={g.code}>
                  <span>{g.name}<span className="small muted">{niceDate(g.checkIn)}, {g.nights} malam, KTP ••••{g.idLast4}</span></span>
                  <span className={`pill ${g.approved ? "pill-ok" : "pill-warn"}`}>{g.approved ? "Disetujui" : g.unpaid ? "Belum dibayar" : "Menunggu"}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Keluhan" sub="Laporkan kerusakan lewat chat.">
          {a.tickets.length === 0 ? (
            <p className="muted small">Belum ada keluhan.</p>
          ) : (
            <ul className="plain-list">
              {a.tickets.map((t) => (
                <li key={t.code}>
                  <span>{t.description}<span className="small muted">{niceDate(t.createdAt)}, {t.category}</span></span>
                  <span className={`pill ${t.status === "RESOLVED" ? "pill-ok" : "pill-mute"}`}>{TICKET[t.status]}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <section className="panel" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <span style={{ marginRight: "auto" }}>Mau daftar tamu, lapor kerusakan, atau tanya sesuatu?</span>
        <OpenChatButton>Tanya lewat chat</OpenChatButton>
        <a className="btn" href="/aturan">Aturan</a>
        <a className="btn" href="/faq">FAQ</a>
        <form method="post" action="/api/auth/logout" style={{ margin: 0 }}>
          <button className="btn" type="submit">Keluar</button>
        </form>
      </section>
    </>
  );
}

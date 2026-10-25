import { findSetupToken } from "@/lib/password-setup";
import FlowShell from "@/components/site/FlowShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Atur password", robots: { index: false, follow: false } };

export default async function SetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const row = await findSetupToken(token);

  return (
    <FlowShell narrow>
      {!row ? (
        <>
          <h1>Link tidak berlaku</h1>
          <p>Link sudah dipakai atau kedaluwarsa. Minta link baru ke pemilik kos ya kak.</p>
        </>
      ) : (
        <form method="post" action="/api/auth/set-password">
          <div className="lbl">Penghuni</div>
          <h1>Atur password</h1>
          <p className="small" style={{ margin: "0 0 18px" }}>
            Untuk {row.tenant.fullName.split(" ")[0]}. Minimal 10 karakter.
          </p>
          {error && <p className="notice bad" role="alert">{error.slice(0, 160)}</p>}
          <input type="hidden" name="token" value={token} />
          <label className="lbl" htmlFor="password">Password baru</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
          <label className="lbl" htmlFor="passwordConfirm">Ulangi password</label>
          <input id="passwordConfirm" name="passwordConfirm" type="password" autoComplete="new-password" minLength={10} required />
          <button className="btn pri" type="submit">Simpan</button>
        </form>
      )}
    </FlowShell>
  );
}

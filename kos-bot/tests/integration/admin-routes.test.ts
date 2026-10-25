import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { ADMIN_COOKIE, adminFromCookie, createAdmin, loginAdmin } from "@/lib/admin-auth";
import { LIMITS } from "@/lib/rate-limit";
import { POST as login } from "@/app/api/admin/login/route";
import { GET as logoutGet, POST as logoutPost } from "@/app/api/admin/logout/route";
import { POST as admins } from "@/app/api/admin/admins/route";
import { POST as setPassword } from "@/app/api/admin/atur-password/route";
import { uniq } from "../helpers";

// Route handlers read the login cookie through next/headers; here it comes from `jar`.
const jar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "kos_admin" && jar.value ? { name, value: jar.value } : undefined) }),
}));

beforeEach(() => {
  jar.value = undefined;
});
afterAll(() => prisma.$disconnect());

const ORIGIN = "http://localhost:3000";
const ip = () => `10.7.${Number(uniq().slice(-4)) % 250}.${Number(uniq().slice(-3)) % 250}`;

function post(p: string, values: Record<string, string>, headers: Record<string, string> = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return new NextRequest(`${ORIGIN}${p}`, { method: "POST", body: f, headers: { origin: ORIGIN, ...headers } });
}
const where = (res: Response) => {
  const loc = res.headers.get("location");
  return loc ? new URL(loc).pathname + new URL(loc).search : null;
};
const tokenOf = (link: string) => link.split("/").pop()!;

async function ownerCookie() {
  return (await loginAdmin(env().OWNER_EMAIL, env().ADMIN_PASSWORD))!.cookie;
}
async function helper(name = "Pak Budi") {
  const email = `staff-${uniq()}@kos.test`;
  const { admin, link } = await createAdmin({ name, email });
  return { admin, email, link };
}

describe("login route", () => {
  it("the owner's email and password set the cookie and go to the dashboard", async () => {
    const res = await login(post("/api/admin/login", { email: env().OWNER_EMAIL, password: env().ADMIN_PASSWORD }, { "x-real-ip": ip() }));
    expect(res.status).toBe(303);
    expect(where(res)).toBe("/admin");
    const cookie = /kos_admin=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1];
    expect(await adminFromCookie(decodeURIComponent(cookie ?? ""))).toMatchObject({ isOwner: true });
  });

  it("a wrong password goes back with ?error=1, and the log names neither email nor password", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const res = await login(post("/api/admin/login", { email: env().OWNER_EMAIL, password: "salah-sekali-123" }, { "x-real-ip": ip() }));
    expect(res.status).toBe(303);
    expect(where(res)).toBe("/admin/login?error=1");
    expect(res.headers.get("set-cookie") ?? "").not.toMatch(/kos_admin=[^;]+\./);
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("admin login failed");
    expect(logged).not.toContain(env().OWNER_EMAIL);
    expect(logged).not.toContain("salah-sekali-123");
    warn.mockRestore();
  });

  it("too many attempts from one IP go back with ?error=limit, even with the right password", async () => {
    const from = ip();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (let i = 0; i < LIMITS.adminLogin.limit; i++) {
      await login(post("/api/admin/login", { email: env().OWNER_EMAIL, password: "salah-sekali-123" }, { "x-real-ip": from }));
    }
    const res = await login(post("/api/admin/login", { email: env().OWNER_EMAIL, password: env().ADMIN_PASSWORD }, { "x-real-ip": from }));
    expect(res.status).toBe(303);
    expect(where(res)).toBe("/admin/login?error=limit");
    vi.restoreAllMocks();
  });

  it("refuses a post from another site", async () => {
    const res = await login(post("/api/admin/login", { email: env().OWNER_EMAIL, password: env().ADMIN_PASSWORD }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });
});

describe("logout route", () => {
  for (const [method, handler] of [["GET", logoutGet], ["POST", logoutPost]] as const) {
    it(`${method} ends the session, clears the cookie and goes to the login page`, async () => {
      const cookie = await ownerCookie();
      const req = new NextRequest(`${ORIGIN}/api/admin/logout`, { method, headers: { origin: ORIGIN, cookie: `${ADMIN_COOKIE}=${cookie}` } });
      const res = await handler(req);
      expect(res.status).toBe(303);
      expect(where(res)).toBe("/admin/login");
      expect(res.headers.get("set-cookie")).toMatch(/kos_admin=;/);
      expect(await adminFromCookie(cookie)).toBeNull();
    });
  }
});

describe("admins route (Kelola admin)", () => {
  it("the owner adds a helper: the link is shown once on a no-store page, never in a URL or the audit log", async () => {
    jar.value = await ownerCookie();
    const email = `staff-${uniq()}@kos.test`;
    const res = await admins(post("/api/admin/admins", { op: "create", name: "Bu Sinta", email }));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("no-store");
    const html = await res.text();
    const link = /(http:\/\/localhost:3000\/admin\/atur-password\/[A-Za-z0-9_-]+)/.exec(html)?.[1];
    expect(link).toBeTruthy();
    expect(html).toContain("Kirim link ini ke Bu Sinta lewat WhatsApp. Berlaku 24 jam, sekali pakai.");
    expect(html).toContain('href="/admin/admin"');

    const admin = await prisma.admin.findUniqueOrThrow({ where: { email } });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "admin:create" }, orderBy: { createdAt: "desc" } });
    expect(audit.actor).toBe("owner");
    expect(JSON.stringify(audit.meta)).toContain(email);
    expect(JSON.stringify(audit.meta)).not.toContain(tokenOf(link!));
    expect(admin.name).toBe("Bu Sinta");
  });

  it("a new link replaces nothing in a URL and works for setting the password", async () => {
    jar.value = await ownerCookie();
    const { admin } = await helper();
    const res = await admins(post("/api/admin/admins", { op: "link", id: admin.id }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const link = /\/admin\/atur-password\/([A-Za-z0-9_-]+)/.exec(await res.text())?.[1];
    expect(link).toBeTruthy();
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "admin:link" }, orderBy: { createdAt: "desc" } });
    expect(JSON.stringify(audit.meta)).not.toContain(link!);
  });

  it("disabling logs the helper out at once; enabling lets them back in", async () => {
    const { admin, email, link } = await helper();
    await setPassword(post("/api/admin/atur-password", { token: tokenOf(link), password: "budi-kunci-123", passwordConfirm: "budi-kunci-123" }, { "x-real-ip": ip() }));
    const helperCookie = (await loginAdmin(email, "budi-kunci-123"))!.cookie;

    jar.value = await ownerCookie();
    const off = await admins(post("/api/admin/admins", { op: "disable", id: admin.id }));
    expect(off.status).toBe(303);
    expect(where(off)).toBe("/admin/admin?saved=1");
    expect(await adminFromCookie(helperCookie)).toBeNull();
    expect(await loginAdmin(email, "budi-kunci-123")).toBeNull();

    const on = await admins(post("/api/admin/admins", { op: "enable", id: admin.id }));
    expect(where(on)).toBe("/admin/admin?saved=1");
    expect(await loginAdmin(email, "budi-kunci-123")).not.toBeNull();
    const actions = (await prisma.auditLog.findMany({ where: { meta: { path: ["email"], equals: email } }, select: { action: true } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["admin:disable", "admin:enable"]));
  });

  it("errors go back as a short code", async () => {
    jar.value = await ownerCookie();
    const { email } = await helper();
    expect(where(await admins(post("/api/admin/admins", { op: "create", name: "Dua", email })))).toBe("/admin/admin?error=taken");
    expect(where(await admins(post("/api/admin/admins", { op: "create", name: "X", email: "bukan-email" })))).toBe("/admin/admin?error=email");
    expect(where(await admins(post("/api/admin/admins", { op: "disable", id: "nope" })))).toBe("/admin/admin?error=notfound");
    expect(where(await admins(post("/api/admin/admins", { op: "terbang" })))).toBe("/admin/admin?error=op");
  });

  it("a helper gets 403, no session 401, another site 403", async () => {
    const { email, link } = await helper();
    await setPassword(post("/api/admin/atur-password", { token: tokenOf(link), password: "budi-kunci-123", passwordConfirm: "budi-kunci-123" }, { "x-real-ip": ip() }));
    jar.value = (await loginAdmin(email, "budi-kunci-123"))!.cookie;
    expect((await admins(post("/api/admin/admins", { op: "create", name: "Penyusup", email: `x-${uniq()}@kos.test` }))).status).toBe(403);

    jar.value = undefined;
    expect((await admins(post("/api/admin/admins", { op: "create", name: "Penyusup", email: `x-${uniq()}@kos.test` }))).status).toBe(401);

    jar.value = await ownerCookie();
    expect((await admins(post("/api/admin/admins", { op: "create", name: "Penyusup", email: `x-${uniq()}@kos.test` }, { origin: "https://evil.example" }))).status).toBe(403);
  });
});

describe("helper sets a password (atur-password route)", () => {
  it("saves it, goes to the login page with ?ready=1, and the helper can log in", async () => {
    const { email, link } = await helper();
    const res = await setPassword(post("/api/admin/atur-password", { token: tokenOf(link), password: "budi-kunci-123", passwordConfirm: "budi-kunci-123" }, { "x-real-ip": ip() }));
    expect(res.status).toBe(303);
    expect(where(res)).toBe("/admin/login?ready=1");

    const res2 = await login(post("/api/admin/login", { email, password: "budi-kunci-123" }, { "x-real-ip": ip() }));
    expect(where(res2)).toBe("/admin");
  });

  it("a used link or a weak password goes back to the form with the message", async () => {
    const { link } = await helper();
    const token = tokenOf(link);
    const weak = await setPassword(post("/api/admin/atur-password", { token, password: "pendek", passwordConfirm: "pendek" }, { "x-real-ip": ip() }));
    expect(decodeURIComponent(where(weak)!)).toContain("minimal 10 karakter");

    await setPassword(post("/api/admin/atur-password", { token, password: "budi-kunci-123", passwordConfirm: "budi-kunci-123" }, { "x-real-ip": ip() }));
    const again = await setPassword(post("/api/admin/atur-password", { token, password: "budi-kunci-456", passwordConfirm: "budi-kunci-456" }, { "x-real-ip": ip() }));
    expect(decodeURIComponent(where(again)!)).toContain("Link sudah dipakai atau kedaluwarsa");
  });

  it("refuses another site, and too many attempts from one IP", async () => {
    const { link } = await helper();
    const values = { token: tokenOf(link), password: "pendek", passwordConfirm: "pendek" };
    expect((await setPassword(post("/api/admin/atur-password", values, { origin: "https://evil.example" }))).status).toBe(403);

    const from = ip();
    for (let i = 0; i < LIMITS.adminSetup.limit; i++) await setPassword(post("/api/admin/atur-password", values, { "x-real-ip": from }));
    expect((await setPassword(post("/api/admin/atur-password", values, { "x-real-ip": from }))).status).toBe(429);
  });
});

describe("every dashboard POST needs a login", () => {
  // Public on purpose: logging in, logging out, and a helper's one-time password link.
  const PUBLIC = new Set(["login", "logout", "atur-password"]);
  const root = path.join(process.cwd(), "src/app/api/admin");
  const routes = (fs.readdirSync(root, { recursive: true }) as string[])
    .filter((f) => f.endsWith("route.ts") && !PUBLIC.has(f.split(path.sep)[0]))
    .sort();

  it("finds the route modules", () => {
    expect(routes.length).toBeGreaterThanOrEqual(10);
    expect(routes).toContain(path.join("admins", "route.ts"));
  });

  for (const file of routes) {
    it(`${file} answers 401 without a session`, async () => {
      const mod = await import(path.join(root, file));
      if (!mod.POST) return;
      const res: Response = await mod.POST(post(`/api/admin/${path.dirname(file)}`, { op: "delete", id: "x" }), { params: Promise.resolve({ kind: "faq" }) });
      expect(res.status).toBe(401);
    });
  }
});

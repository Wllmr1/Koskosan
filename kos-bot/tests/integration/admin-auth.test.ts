import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import {
  actorOf,
  adminFromCookie,
  consumeAdminSetup,
  createAdmin,
  loginAdmin,
  logoutAdmin,
  setAdminDisabled,
} from "@/lib/admin-auth";
import { uniq } from "../helpers";

afterAll(() => prisma.$disconnect());

const MIN = 60_000;
const ownerLogin = () => loginAdmin(env().OWNER_EMAIL.toUpperCase(), env().ADMIN_PASSWORD);
const tokenOf = (link: string) => link.split("/").pop()!;

describe("owner login", () => {
  it("needs the owner email and the password", async () => {
    const ok = await ownerLogin();
    expect(ok).not.toBeNull();
    const who = await adminFromCookie(ok!.cookie);
    expect(who).toMatchObject({ isOwner: true });
    expect(actorOf(who!)).toBe("owner");

    expect(await loginAdmin(env().OWNER_EMAIL, "wrong-password-123")).toBeNull();
    expect(await loginAdmin("someone@else.example", env().ADMIN_PASSWORD)).toBeNull();
  });

  it("ends after 30 minutes without activity, and after 4 hours in any case", async () => {
    const idle = await ownerLogin();
    const s1 = await prisma.adminSession.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    await prisma.adminSession.update({ where: { id: s1.id }, data: { lastSeenAt: new Date(Date.now() - 31 * MIN) } });
    expect(await adminFromCookie(idle!.cookie)).toBeNull();

    const busy = await ownerLogin();
    const s2 = await prisma.adminSession.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    await prisma.adminSession.update({ where: { id: s2.id }, data: { createdAt: new Date(Date.now() - 241 * MIN), lastSeenAt: new Date() } });
    expect(await adminFromCookie(busy!.cookie)).toBeNull();
  });

  it("logging out ends the session", async () => {
    const s = await ownerLogin();
    await logoutAdmin(s!.cookie);
    expect(await adminFromCookie(s!.cookie)).toBeNull();
  });

  it("a tampered cookie is refused", async () => {
    const s = await ownerLogin();
    const [payload, exp] = s!.cookie.split(".");
    expect(await adminFromCookie(`${payload}x.${exp}.abc`)).toBeNull();
  });
});

describe("registered admins", () => {
  it("set a password with their link, log in, and are named in the audit log", async () => {
    const email = `staff-${uniq()}@kos.test`;
    const { admin, link } = await createAdmin({ name: "Pak Joko", email: email.toUpperCase() });
    expect(admin.email).toBe(email);
    expect(await loginAdmin(email, "belum-ada-password")).toBeNull();

    expect(await consumeAdminSetup(tokenOf(link), "pendek", "pendek")).toMatchObject({ ok: false });
    expect(await consumeAdminSetup(tokenOf(link), "joko-kunci-123", "joko-kunci-123")).toEqual({ ok: true });
    expect(await consumeAdminSetup(tokenOf(link), "joko-kunci-456", "joko-kunci-456")).toMatchObject({ ok: false });

    const s = await loginAdmin(email, "joko-kunci-123");
    const who = await adminFromCookie(s!.cookie);
    expect(who).toMatchObject({ isOwner: false, name: "Pak Joko" });
    expect(actorOf(who!)).toBe(`admin:${email}`);
  });

  it("disabling an admin ends their open session and blocks login", async () => {
    const email = `staff-${uniq()}@kos.test`;
    const { admin, link } = await createAdmin({ name: "Bu Rina", email });
    await consumeAdminSetup(tokenOf(link), "rina-kunci-123", "rina-kunci-123");
    const s = await loginAdmin(email, "rina-kunci-123");
    expect(await adminFromCookie(s!.cookie)).not.toBeNull();

    await setAdminDisabled(admin.id, true);
    expect(await adminFromCookie(s!.cookie)).toBeNull();
    expect(await loginAdmin(email, "rina-kunci-123")).toBeNull();
  });

  it("refuses the owner's email or a duplicate as a new admin", async () => {
    await expect(createAdmin({ name: "Palsu", email: env().OWNER_EMAIL })).rejects.toThrow(/pemilik/);
    const email = `staff-${uniq()}@kos.test`;
    await createAdmin({ name: "Satu", email });
    await expect(createAdmin({ name: "Dua", email })).rejects.toThrow(/sudah terdaftar/);
  });
});

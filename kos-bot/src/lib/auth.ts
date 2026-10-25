import { redirect } from "next/navigation";
import { currentAdmin, type AdminIdentity } from "./admin-auth";

/** Any logged-in dashboard user (owner or registered admin). */
export async function isAdmin(): Promise<boolean> {
  return (await currentAdmin()) !== null;
}

/** For dashboard pages: the logged-in admin, or a redirect to the login page. Every page calls this itself. */
export async function requireAdmin(): Promise<AdminIdentity> {
  const who = await currentAdmin();
  if (!who) redirect("/admin/login");
  return who;
}

/** For owner-only pages (managing admins). Other admins go back to the dashboard. */
export async function requireOwner(): Promise<AdminIdentity> {
  const who = await requireAdmin();
  if (!who.isOwner) redirect("/admin");
  return who;
}

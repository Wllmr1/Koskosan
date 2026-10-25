import { prisma } from "@/lib/prisma";

/** Frame for the pages that live outside the site layout (rent form, payment result, login):
 *  the new look, a centred wordmark linking home, and the content in a narrow column. */
export default async function FlowShell({ children, narrow }: { children: React.ReactNode; narrow?: boolean }) {
  const settings = await prisma.propertySetting.findUnique({ where: { id: "default" } });
  return (
    <div className="rk">
      <main className="wrap flow-page">
        <a className="flow-brand" href="/">{settings?.name ?? "Kos"}</a>
        <div className={narrow ? "login" : "flow"}>{children}</div>
      </main>
    </div>
  );
}

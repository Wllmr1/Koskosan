import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./rk.css";
import ChatWidget from "@/components/ChatWidget";

export const metadata: Metadata = {
  title: "RoemahKOE",
  description: "Kos mahasiswa dengan kontrak digital, pembayaran online, dan asisten 24 jam.",
  robots: { index: true, follow: true },
};

/** Light only, day and night: browsers must not auto-darken the page. */
export const viewport: Viewport = { colorScheme: "only light", themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,500;1,6..96,400&family=Instrument+Sans:wght@400;500;600&family=Jost:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <ChatWidget />
      </body>
    </html>
  );
}

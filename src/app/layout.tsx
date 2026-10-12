import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "DataForge — Fase 0A (esqueleto técnico)",
  description:
    "Spike técnico de la fase 0A: esqueleto Next.js estático. Sin funcionalidades de producto implementadas.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}

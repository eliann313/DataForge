import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 0A.1: candidato Next.js con exportación estática (ADR-0001, estado Propuesto).
  // Sin Route Handlers, sin SSR dinámico, sin headers en next.config.
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // Solo desarrollo: permite el smoke E2E vía 127.0.0.1 (Playwright).
  // No afecta la exportación estática de producción.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;

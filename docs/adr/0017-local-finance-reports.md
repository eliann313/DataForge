# ADR-0017: Informes financieros locales reproducibles

Estado: aceptado. Fecha: 2026-11-05.

Los informes financieros se calculan desde movimientos y cuentas persistidos en IndexedDB al solicitar su generación. El período utiliza fecha inicial y final inclusivas. ARS y USD se resumen por separado, sin conversión; las transferencias propias se listan aparte y no alteran ingresos, gastos ni saldos del resumen. Los desgloses son por categoría y cuenta.

La exportación abre un documento HTML imprimible generado a partir de los datos locales. Todo texto libre se escapa antes de insertarlo como HTML; cifras y fechas se renderizan como texto. El informe no guarda una copia derivada ni altera movimientos: puede regenerarse para el mismo estado persistido y rango. No sincroniza con servicios remotos.

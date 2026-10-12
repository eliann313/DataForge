# Datos de demostración y fixtures

Los CSV/XLSX de este directorio son **ficticios o de prueba**, nunca mediciones
reales. Los valores dentro de los mockups de `docs/design` tampoco son datos.

## Fixtures de prueba (consultas con resultados esperados independientes)

| Archivo | Contenido esperado |
|---|---|
| `numeros.csv` | 5 filas; `importe` suma 1475.75, media 295.15, mín 50.25, máx 1000 |
| `muchas.csv` | 45 filas (`id` 1–45, `valor` = id×2); `valor` suma 2070, media 46; `grupo`=g1 son 15 |
| `hostil.csv` | Delimitador `;`, cabeceras con comillas e intento de inyección; 1 fila, tabla intacta |
| `vacio.csv` | 0 bytes; debe rechazarse con error recuperable |
| `sonda.xlsx` | 1 hoja `Datos`, 2 filas (`id`, `nombre`); la sonda `read_xlsx` nativa lee 3 filas (encabezado incluido) |
| `promo.csv` / `promo.json` | 5 filas; `importe` suma 2021.25; `promo` 3 nulos (60 %); `producto` 2 distintos; JSON con `origen` anidado (STRUCT) |
| `ventas.parquet` | 8 filas (generado por `scripts/gen-parquet-fixture.mjs`); `importe` suma 3901.50; `cantidad` 2 nulos |
| `duplicadas.csv` | 3 filas, 1 grupo duplicado (filas idénticas en todas las columnas) |
| `sin-encabezado.csv` | 2 filas sin encabezados (column0/column1) |

## Ejemplos de producto («Probar un ejemplo», datos ficticios)

| Archivo | Contenido |
|---|---|
| `ventas-demo.csv` | 12 operaciones con producto, categoría, cantidad e importe |
| `finanzas-demo.csv` | 10 movimientos con tipo, categoría, importe y moneda (ARS/USD por separado, sin conversión) |
| `encuestas-demo.csv` | 10 respuestas con edad, satisfacción 1–5 y canal |

Se importan con el motor general; no habilitan plantillas especializadas.

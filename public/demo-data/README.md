# Datos de demostración y fixtures

Los CSV/XLSX de este directorio son **ficticios o de prueba**, nunca mediciones
reales. Los valores dentro de los mockups de `docs/design` tampoco son datos.

## Fixtures de prueba (consultas con resultados esperados independientes)

| Archivo | Contenido esperado |
|---|---|
| `numeros.csv` | 5 filas; `importe` suma 1475.75, media 295.15, mín 50.25, máx 1000 |
| `muchas.csv` | 45 filas (`id` 1–45, `valor` = id×2); `valor` suma 2070, media 46 |
| `hostil.csv` | Delimitador `;`, cabeceras con comillas e intento de inyección; 1 fila, tabla intacta |
| `vacio.csv` | 0 bytes; debe rechazarse con error recuperable |
| `sonda.xlsx` | 1 hoja `Datos`, 2 filas (`id`, `nombre`); la sonda `read_xlsx` nativa lee 3 filas (encabezado incluido) |

## Ejemplos de producto («Probar un ejemplo», datos ficticios)

| Archivo | Contenido |
|---|---|
| `ventas-demo.csv` | 12 operaciones con producto, categoría, cantidad e importe |
| `finanzas-demo.csv` | 10 movimientos con tipo, categoría, importe y moneda (ARS/USD por separado, sin conversión) |
| `encuestas-demo.csv` | 10 respuestas con edad, satisfacción 1–5 y canal |

Se importan con el motor general; no habilitan plantillas especializadas.

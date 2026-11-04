# ADR-0008 — Comparación de períodos y cambios por clave

- **Estado:** Aceptado e integrado en `main` (PR #36, R2/fase 4).
- **Relacionados:** [ADR-0005](./0005-definiciones-de-pipeline-locales.md), [ADR-0007](./0007-combinaciones-append-y-join.md) y [roadmap](../roadmap.md).

## Contexto y decisión

La comparación de versiones cuenta filas y duplicados, pero por sí sola no identifica cambios ni define períodos. La fase 4 necesita una comparación explícita que no mezcle unidades, no multiplique filas por claves repetidas y conserve la precisión de las sumas.

- El usuario selecciona dos versiones del proyecto activo y una columna `DATE` con el mismo nombre y tipo. Elige dos rangos de fechas con ambos extremos incluidos; las fechas nulas quedan fuera. El mismo dataset puede servir para ambos períodos.
- Elige una columna entera o decimal exacta, con el mismo nombre y tipo y rol de medida en ambas versiones. Confirma que todos los valores tienen la misma unidad y moneda; la aplicación no realiza conversiones ni detecta mezclas automáticamente.
- Se muestran filas, valores no nulos, suma exacta como texto y media aproximada de coma flotante. Con cero valores no nulos, suma y media se muestran como ausentes. Se aplica la comprobación conservadora de precisión de análisis; un resultado fuera de rango o una suma desbordada produce un error visible.
- La comparación por clave es opcional. Requiere esquemas idénticos y una columna del mismo tipo compatible, única y no nula en cada período. Se rechazan claves repetidas o nulas antes de unir. Las altas y bajas cuentan claves exclusivas; los cambios comparan todas las columnas salvo la clave y la columna de fecha elegida, usando igualdad con tratamiento explícito de nulos. Un cambio de clave cuenta como baja y alta.
- La comparación no altera ni crea versiones. Cada ejecución lee los datos completos seleccionados. No promete capacidad o tiempo máximo sin mediciones; los datos, versiones y resultados siguen en memoria de sesión.

## Alternativas y límites

Aceptar timestamps implicaría definir zona horaria y límites de día; por ahora se requiere convertir a `DATE` explícitamente. Mapear nombres o tipos entre esquemas exigiría reglas de conversión y correspondencia adicionales; por ahora las claves requieren esquemas idénticos. Una clave compuesta puede incorporarse posteriormente con su propia validación. El usuario debe preparar o filtrar por moneda antes de comparar; confirmar unidades no verifica semánticamente el contenido.

## Verificación y revisión

Las pruebas de navegador usan períodos con fechas de borde, decimales y altas, bajas y cambios; también comprueban rechazo de claves nulas, repetidas y rangos inválidos. La implementación quedó integrada en `main` y el cierre de fase 4 se verificó en el build estático. Medir el costo con el equipo, navegador, tamaño y número de filas reales antes de establecer cualquier límite de rendimiento.

Medición local del 2026-11-04: Linux x64 6.18.57, Intel Xeon Platinum 8370C, 5 CPU lógicas visibles (cuota de 4 CPU), límite de memoria del contenedor 32 GiB, Node 24.19.0, Chromium headless 156.0.8078.4 y DuckDB-Wasm 1.33.1-dev57.0 / motor v1.5.4. Sobre el build estático se importó un CSV generado de 100.000 filas y 2.077.805 bytes, con tres columnas y 50.000 claves en cada período; la comparación incluyó validación de claves, métricas y 50.000 cambios. Tras una ejecución de calentamiento, los cinco tiempos desde la acción del navegador hasta el resultado fueron 224, 116, 130, 242 y 116 ms (mediana 130 ms; rango 116–242 ms). No incluyen inicialización ni importación; sí incluyen la interacción automatizada y las consultas. No se midió memoria máxima. Es una observación de un caso, no un límite de capacidad ni una garantía para otras máquinas o joins.

Para reproducirlo, generar el build, servir `out/` con `node scripts/serve-out.mjs out 3102` y ejecutar `node benchmarks/period-comparison.mjs` con Chromium instalado. El script genera el CSV en memoria, verifica los resultados y registra los tiempos; `PERIOD_BENCH_URL` permite cambiar la URL del sitio estático.

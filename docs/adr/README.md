# Registro de decisiones de arquitectura (ADR)

Cada ADR documenta una decisión técnica con su contexto, alternativas y criterios para confirmarla o revertirla. Un ADR **no** implica que lo descrito esté implementado.

| ADR | Decisión | Estado |
|---|---|---|
| [0001](./0001-framework-y-exportacion-estatica.md) | Framework de aplicación y exportación estática (Next.js frente a Vite) | Aceptado — cerrado con la fase 0A |
| [0002](./0002-motores-analiticos-y-criterios-de-corte.md) | Motores analíticos, intercambio de datos y criterios de corte | Propuesto — tabular medido; se cierra con 0B y 0C |
| [0003](./0003-persistencia-opfs-diferido.md) | Persistencia local: metadatos en IndexedDB; datasets en sesión, OPFS diferido | Aceptado — fase 5 conserva la sesión y separa ambos respaldos |
| [0004](./0004-versiones-derivadas-de-pipelines.md) | Versiones derivadas de pipelines dentro de la sesión | Aceptado — alcance inicial de R2/fase 4 |
| [0005](./0005-definiciones-de-pipeline-locales.md) | Definiciones de pipeline guardadas por proyecto en IndexedDB | Aceptado — R2/fase 4 |
| [0006](./0006-multiples-datasets-en-sesion.md) | Varias fuentes por proyecto dentro de la sesión DuckDB | Aceptado — R2/fase 4 |
| [0007](./0007-combinaciones-append-y-join.md) | Semántica y validación de APPEND/JOIN con linaje múltiple | Aceptado — R2/fase 4 |
| [0008](./0008-comparacion-de-periodos.md) | Rangos de fechas, medidas y cambios por clave entre períodos | Aceptado — R2/fase 4 |
| [0009](./0009-snapshots-de-analisis.md) | Snapshots locales de resultados de análisis y vínculo a versiones de sesión | Aceptado — primer corte de fase 5 |
| [0010](./0010-informes-locales-basados-en-snapshots.md) | Informes locales basados en resultados congelados | Aceptado — informes referidos a snapshots históricos |
| [0011](./0011-respaldo-portable-v1-metadatos.md) | Formato portable v1 para metadatos y artefactos locales del proyecto | Aceptado — JSON solo de metadatos y artefactos, sin archivos ni OPFS |
| [0012](./0012-respaldo-portable-de-datasets.md) | Respaldo opcional de datasets materializados en Parquet | Aceptado — archivo portable de versiones de sesión; sin persistencia durable |
| [0013](./0013-finance-accounts-and-transfer-migration.md) | Cuentas financieras locales, transferencias propias y migración v2 | Aceptado — primer corte de fase 6 |
| [0014](./0014-finance-local-file-import.md) | Importación local CSV/XLSX con preview, duplicados y lote atómico | Aceptado — segundo corte de fase 6 |
| [0015](./0015-finance-card-accounts-and-refunds.md) | Tarjetas como pasivo y reintegros enlazados | Aceptado para validación — corte siguiente de fase 6 |
| [0016](./0016-finance-category-catalog-and-highlights.md) | Catálogo local de categorías y movimientos destacados | Propuesto — siguiente corte de fase 6 |
| [0017](./0017-local-finance-reports.md) | Informes financieros locales reproducibles e imprimibles | Aceptado — fase 6 |

## Estados

- **Propuesto:** decisión provisional; falta evidencia medida.
- **Aceptado:** respaldado por resultados registrados en el propio ADR.
- **Modificado / Reemplazado:** el ADR enlaza al que lo sustituye y conserva el historial.

## Formato

Contexto → hechos verificados (con fuente y fecha de consulta) → opciones → decisión → criterios de evaluación y descarte → consecuencias. Los resultados de mediciones se agregan al ADR con equipo, navegador, versiones y tamaños reales de archivo.

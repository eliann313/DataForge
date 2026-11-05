# ADR-0011 — Respaldo portable v1 de artefactos de proyecto

- **Estado:** Aceptado — cierre de fase 5 (2026-11-05).
- **Fecha:** 2026-11-05
- **Relacionado:** [ADR-0003](./0003-persistencia-opfs-diferido.md), [ADR-0009](./0009-snapshots-de-analisis.md), [ADR-0010](./0010-informes-locales-basados-en-snapshots.md) y fase 5 del [roadmap](../roadmap.md).

## Contexto

El proyecto guarda metadatos y definiciones declarativas de pipelines en
IndexedDB. Los snapshots almacenan resultados JSON, parámetros y linaje, y los
informes conservan referencias a esos snapshots. Los bytes de las fuentes y las
versiones DuckDB solo viven en la sesión del Worker; no se pueden recuperar al
recargar la aplicación.

Una copia debe preservar los artefactos locales que sí son portables sin
presentarse como recuperación de los datos analíticos originales. Al importar,
los registros pertenecen a un proyecto nuevo y sus referencias internas deben
seguir apuntando a los snapshots copiados.

## Decisión

El formato JSON `dataforge-project-backup`, versión 1, incluye el nombre y el
identificador de origen del proyecto, definiciones de pipeline, snapshots e
informes. El manifiesto declara explícitamente que no incluye ubicación de
carpeta, bytes de datasets ni versiones DuckDB. Los datos fuente se excluyen en
la exportación. Por separado, ADR-0012 define el archivo opcional `.dfdataset`
para versiones Parquet materializadas de una sesión; importar ese archivo no
reconecta snapshots ni informes a las nuevas identidades de dataset.

Antes de exportar o escribir, se valida el esquema y tamaño de cada artefacto,
la pertenencia al proyecto de origen, la unicidad de IDs y que cada sección de
snapshot de un informe apunte a un snapshot incluido. El parser valida el
documento entero antes de iniciar escrituras. La importación crea un UUID nuevo,
remapea a él el `projectId` de snapshots e informes y el `projectId` de todos
los nodos del linaje; conserva los IDs locales, las versiones y sesiones como
metadatos históricos y las referencias `snapshotId`. No vuelve a asociar una
fuente reimportada con esas referencias. Los IDs compuestos por proyecto
mantienen los registros aislados. No se sobrescribe un proyecto existente.

El archivo JSON exportado tiene un máximo de 5 MiB, además de los límites
propios de cada dominio y un máximo de 500 definiciones, snapshots e informes.
Se conserva la estructura completa del snapshot, incluido el linaje; no se
reduce a campos de presentación ni se descartan propiedades al serializar.

La escritura ocurre en este orden: definiciones, snapshots, informes y, al
final, metadatos del proyecto. Si una operación falla, se intentan borrar todos
los registros escritos por esta importación, continuando la compensación aunque
un borrado falle. El error reporta tanto el fallo original como cada error de
rollback. Como estos repositorios usan bases IndexedDB separadas, no existe una
transacción atómica ni se puede garantizar la reversión si la pestaña o el
navegador se cierran durante el proceso. En ese caso podrían quedar registros
huérfanos bajo el UUID nuevo; un rollback intentado no garantiza recuperación.

## Consecuencias y límites

- Restaurar conserva resultados históricos y referencias, pero no permite
  recalcular análisis sin volver a importar las fuentes.
- El identificador de sesión y el linaje se conservan como datos históricos; no
  prueban que la fuente original siga disponible.
- Importar crea un proyecto raíz con ID nuevo; las carpetas no se incluyen.
- La consulta previa de colisión de UUID no reserva el ID frente a otras
  pestañas; no se promete seguridad multi-pestaña.
- El respaldo no cubre bytes de origen, versiones DuckDB, archivos temporales
  ni una garantía transaccional entre bases locales.
- La recuperación del JSON es histórica: restaura metadatos, resultados
  congelados, linaje y referencias en un proyecto nuevo; no permite recalcular
  análisis ni reanudar una sesión sin volver a importar fuentes.
- Este formato no usa OPFS ni agrega persistencia durable. La decisión de
  mantener datasets y versiones en memoria de sesión y ofrecer respaldos
  separados está en ADR-0003. No se afirma capacidad global de memoria.

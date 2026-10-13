# ADR-0006 — Varias fuentes por proyecto dentro de la sesión

- **Estado:** Aceptado localmente (2026-10-12, PR #16; pendiente de revisión e integración).
- **Relacionados:** [ADR-0003](./0003-persistencia-opfs-diferido.md), [ADR-0004](./0004-versiones-derivadas-de-pipelines.md), [ADR-0005](./0005-definiciones-de-pipeline-locales.md), [roadmap](../roadmap.md).

## Contexto

La fase 4 requiere preparar y combinar más de una fuente. La decisión inicial de ADR-0004 mantenía una sola tabla activa en el Worker. Guardar archivos al habilitar varias fuentes ampliaría el alcance de persistencia antes del respaldo portable de fase 5 y podría prometer recuperación que todavía no existe.

## Hechos verificados

- El Worker DuckDB puede conservar varias tablas y vistas durante la sesión.
- Los proyectos y las definiciones de pipeline ya tienen identidad local persistente; los bytes y resultados de DuckDB no.
- APPEND/JOIN pueden depender de varias fuentes y una versión derivada puede tener más de un padre.
- Cerrar o reiniciar el Worker libera su estado; al recargar se deben reimportar las fuentes.

## Decisión

- Agregar cada importación como una fuente inmutable al proyecto activo de la sesión; un error durante staging no reemplaza ni elimina fuentes existentes.
- Etiquetar cada fuente y versión con `projectId`; cambiar el proyecto activo limita las consultas y la UI a ese proyecto y recuerda su última versión mientras vive el Worker.
- Mantener las tablas de origen y vistas derivadas únicamente en el Worker. No guardar los bytes ni resultados en IndexedDB u OPFS.
- Representar el linaje de versiones con `sourceIds` (fuentes originales), `parentIds` (padres inmediatos) y `operationType`; conservar `sourceId` y `parentId` como referencias principales para la API previa.
- Al quitar una fuente, eliminar sus versiones derivadas, incluidas combinaciones y pipelines que dependan de cualquiera de sus fuentes, y liberar sus vistas/tablas.
- Mantener un límite de 32 vistas derivadas por fuente para controlar el catálogo de sesión.

## Alternativas

| Opción | Evaluación |
|---|---|
| Reemplazar la fuente activa al importar otra | Impide combinar archivos y pierde contexto útil; descartada. |
| Persistir tablas automáticamente al importar | Confunde metadatos de proyecto con recuperación de archivos; se difiere al diseño del respaldo portable de fase 5. |
| Mantener varias fuentes en el Worker, sin persistir bytes/resultados | Permite componer datasets y preserva el alcance local actual; adoptada. |

## Consecuencias y límites

- El usuario puede importar varios archivos, activar fuentes y combinaciones del proyecto y regresar a versiones anteriores durante la sesión.
- Cambiar de proyecto no expone tablas de otros proyectos; no existe persistencia de datasets entre recargas.
- Quitar una fuente invalida y elimina todas las versiones que la utilizan; las versiones no se pueden recuperar sin reimportar.
- El límite es por fuente y por vistas de sesión; este ADR no acredita rendimiento para datasets grandes.

## Verificación

La suite Playwright de pipelines pasó 32/32 en Chromium y Firefox el 2026-10-12. El escenario de limpieza de fuente se amplió después y pasó 2/2 en Chromium/Firefox; incluye varias fuentes en un proyecto, aislamiento al cambiar de proyecto y eliminación de las vistas derivadas de una fuente quitada. El build estático pasó y el smoke general del export pasó 47/47 en Chromium.

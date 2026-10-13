# ADR-0005 — Definiciones de pipeline locales por proyecto

- **Estado:** Aceptado (2026-10-12, R2/fase 4).
- **Relacionados:** [ADR-0003](./0003-persistencia-opfs-diferido.md), [ADR-0004](./0004-versiones-derivadas-de-pipelines.md), [roadmap](../roadmap.md), [avance R2](../primeras-entregas.md).

## Contexto

La fase 4 requiere poder repetir una preparación de datos. ADR-0004 mantuvo las definiciones solo durante la sesión inicial, mientras que OPFS, los archivos y las versiones derivadas quedaron diferidos. Guardar una definición declarativa permite recuperarla sin retener los datos ni alterar esa decisión.

## Hechos verificados

- Los proyectos y carpetas ya persisten metadatos en IndexedDB (`dataforge`).
- DuckDB-Wasm mantiene fuentes y vistas derivadas en memoria del Worker; ADR-0006 describe su aislamiento por proyecto y ADR-0007 el linaje de las combinaciones. Cerrar o recargar pierde esos datos.
- Los pasos disponibles son uniones cerradas de tipos conocidos, no SQL libre.
- Las definiciones pueden referirse a columnas que falten o cambien de tipo en otro archivo; deben validarse antes de reutilizarlas.

## Decisión

- Guardar solo `PipelineDefinition` en una base IndexedDB propia del módulo (`dataforge-pipelines`), con clave compuesta por proyecto e identificador de definición.
- Listar, actualizar y eliminar definiciones dentro del proyecto. Cada operación de escritura usa una transacción; un registro con estructura desconocida se reporta como error y no se carga parcialmente.
- Validar una definición contra el esquema de la versión actualmente seleccionada antes de guardarla o cargarla al editor. La vista previa y la ejecución mantienen además las validaciones de datos y precisión del motor.
- Permitir reutilizar la definición en otro dataset compatible del proyecto. Los datos originales, las versiones derivadas y sus resultados no se guardan junto con ella.
- Mantener archivos, materialización de resultados, OPFS y respaldo portable para la decisión de fase 5; esta decisión no modifica ADR-0003 ni sustituye la exportación portable.

## Alternativas

| Opción | Evaluación |
|---|---|
| Guardar definición y archivos/resultados en OPFS | Amplía el alcance y promete persistencia de datos antes de definir el respaldo portable; diferida a fase 5. |
| Guardar definiciones en memoria del Worker | No permite repetir el trabajo tras recargar; insuficiente para la fase 4. |
| Guardar solo definiciones en IndexedDB | Conserva reglas pequeñas, locales y comprobables; adoptada. |

## Consecuencias y límites

- Las definiciones sobreviven una recarga en el mismo navegador y dispositivo; el dataset debe importarse otra vez.
- Una incompatibilidad de columnas o tipos bloquea la carga al editor y deja intacta la definición guardada.
- La persistencia local puede perderse por limpieza del navegador, cuota o cambio de dispositivo; el respaldo portable todavía no está implementado.
- Esta decisión cubre la persistencia local de definiciones, no de archivos ni resultados. Las varias fuentes y las validaciones APPEND/JOIN posteriores se documentan en ADR-0006 y ADR-0007; los criterios locales de fase 4 se describen en el roadmap.

## Verificación del incremento

`npm run typecheck` y `npm run lint` pasaron; `npm test` pasó con 63/63. La suite
Playwright completa pasó 88/88 en Chromium y Firefox; el recorrido de guardado y
recuperación se volvió a ejecutar después del último ajuste de interfaz y pasó
2/2. El build estático no se repitió en este incremento.

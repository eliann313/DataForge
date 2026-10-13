# ADR-0004 — Versiones derivadas de pipelines en la sesión

- **Estado:** Aceptado (2026-10-12, primer corte de R2/fase 4).
- **Relacionados:** [ADR-0003](./0003-persistencia-opfs-diferido.md), [roadmap](../roadmap.md), [avance R2](../primeras-entregas.md).

## Contexto

R1 mantiene el dataset importado en memoria dentro de DuckDB-Wasm. Fase 4 necesita que una transformación produzca un resultado revisable y que la fuente original permanezca disponible. Copiar físicamente cada resultado en el Worker podría multiplicar la memoria ocupada; introducir OPFS antes de definir el respaldo portable también agregaría persistencia que el producto todavía no puede explicar al usuario.

## Hechos verificados

- El primer corte importaba un dataset por vez en el Worker; ADR-0006 amplía el catálogo a varias fuentes aisladas por proyecto sin hacerlas persistentes.
- Los filtros de E4 solo cambian la vista exploratoria y no generan una versión.
- El primer corte de fase 4 ejecuta pasos tipados con DuckDB-Wasm y conserva la fuente para volver a ella.
- La implementación usa vistas DuckDB derivadas, con nombres internos generados por la aplicación. Las consultas reutilizan la vista; el usuario no proporciona SQL ni nombres de tabla.

## Decisión

- Mantener la tabla importada como fuente de sesión inmutable.
- Representar el resultado del pipeline como una vista DuckDB derivada de la versión elegida; guardar en memoria el nombre, el esquema, el conteo, el padre, el pipeline y la fecha de creación.
- Permitir activar cualquier versión aún disponible durante la sesión. Limitar a 32 las versiones derivadas de la fuente importada; se libera la cadena al reemplazar el archivo o terminar el Worker.
- Aceptar solo pasos declarativos cerrados: filtro, selección de columnas, descarte de filas nulas según columnas elegidas, reemplazo de nulos por un valor explícito, conversión a `INTEGER`, `BIGINT`, `DECIMAL(p,s)`, `BOOLEAN` o `VARCHAR`, normalización de fechas a `DATE` con formatos enumerados, normalización de texto (recorte de extremos, cambio de mayúsculas/minúsculas y texto vacío a nulo), renombre, eliminación de filas idénticas y orden final. Escapar identificadores y literales; validar valores numéricos por tipo; no aceptar SQL arbitrario.
- Antes de previsualizar o crear la vista derivada, validar cada conversión contra los datos del paso anterior. Rechazar valores incompatibles, desbordes y conversiones numéricas o decimales que pierdan precisión; conservar los valores nulos.
- Resolver literales de filtro según el tipo físico: igualdad sobre texto compara como texto; `gt/gte/lt/lte` requieren columnas numéricas y valores numéricos válidos. Esto conserva códigos con ceros iniciales como `00123`.
- Mantener las fuentes, resultados y metadatos de versión en memoria. ADR-0005 decide por separado guardar solo las definiciones en IndexedDB; archivos y resultados no se guardan en OPFS/IndexedDB.
- Revisar la estrategia de materialización y persistencia al desarrollar exportación/respaldo portable en fase 5, con mediciones de memoria y ejecución.

## Alternativas

| Opción | Evaluación |
|---|---|
| Copiar cada resultado a una tabla DuckDB | Evita recalcular cada consulta, pero cada versión puede consumir memoria proporcional al dataset. Se pospone hasta medir casos de uso R2. |
| Vistas derivadas en DuckDB | Evitan duplicar filas y mantienen el linaje durante la sesión; las consultas posteriores pueden volver a ejecutar pasos. Adoptada para el primer corte. |
| Persistir de inmediato en OPFS | Aumenta alcance de recuperación, migraciones y manejo de cuotas antes de definir exportación portable. Diferida a fase 5. |

## Consecuencias y límites

- Un error al validar o crear una vista no cambia la versión activa; la fuente y las vistas previas existentes siguen disponibles.
- En el corte inicial una reimportación reemplazaba el único dataset. ADR-0006 cambia el flujo: cada importación agrega una fuente al proyecto activo; quitar una fuente elimina esa fuente y las vistas que dependan de ella.
- Las versiones desaparecen al cerrar el Worker o recargar. La definición del pipeline no sobrevive a la vista actual ni se guarda en el proyecto.
- Las vistas pueden recalcular transformaciones en cada lectura; este corte no acredita rendimiento ni capacidad para grandes cadenas.
- Esta decisión cubre solo la vida de las versiones en sesión. La persistencia de definiciones, varias fuentes y las semánticas de combinación se resolvieron después en ADR-0005, ADR-0006 y ADR-0007.

## Evidencia de implementación

El corte actual se verificó con `npm run typecheck`, `npm run lint`, `npm test`
(58/58), `npm run build`, Playwright (86/86 en Chromium y Firefox contra el
servidor local de Next.js) y `npm run smoke:static` (43/43 en Chromium contra el
export recién generado). Estas funciones continúan fuera de la demo pública R1.

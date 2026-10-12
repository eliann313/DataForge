# ADR-0004 — Versiones derivadas de pipelines en la sesión

- **Estado:** Aceptado (2026-10-12, primer corte de R2/fase 4).
- **Relacionados:** [ADR-0003](./0003-persistencia-opfs-diferido.md), [roadmap](../roadmap.md), [avance R2](../primeras-entregas.md).

## Contexto

R1 mantiene el dataset importado en memoria dentro de DuckDB-Wasm. Fase 4 necesita que una transformación produzca un resultado revisable y que la fuente original permanezca disponible. Copiar físicamente cada resultado en el Worker podría multiplicar la memoria ocupada; introducir OPFS antes de definir el respaldo portable también agregaría persistencia que el producto todavía no puede explicar al usuario.

## Hechos verificados

- La aplicación importa un dataset por vez en el Worker; el archivo y el dataset no persisten al recargar.
- Los filtros de E4 solo cambian la vista exploratoria y no generan una versión.
- El primer corte de fase 4 ejecuta pasos tipados con DuckDB-Wasm y conserva la fuente para volver a ella.
- La implementación usa vistas DuckDB derivadas, con nombres internos generados por la aplicación. Las consultas reutilizan la vista; el usuario no proporciona SQL ni nombres de tabla.

## Decisión

- Mantener la tabla importada como fuente de sesión inmutable.
- Representar el resultado del pipeline como una vista DuckDB derivada de la versión elegida; guardar en memoria el nombre, el esquema, el conteo, el padre, el pipeline y la fecha de creación.
- Permitir activar cualquier versión aún disponible durante la sesión. Limitar a 32 las versiones derivadas de la fuente importada; se libera la cadena al reemplazar el archivo o terminar el Worker.
- Aceptar solo pasos declarativos cerrados: filtro, selección de columnas, descarte de filas nulas según columnas elegidas, renombre, eliminación de filas idénticas y orden final. Escapar identificadores y literales; no aceptar SQL arbitrario.
- Resolver literales de filtro según el tipo físico: igualdad sobre texto compara como texto; `gt/gte/lt/lte` requieren columnas numéricas y valores numéricos válidos. Esto conserva códigos con ceros iniciales como `00123`.
- Mantener estos metadatos y versiones en memoria. No guardar definiciones, archivos ni resultados en OPFS/IndexedDB en este corte.
- Revisar la estrategia de materialización y persistencia al desarrollar exportación/respaldo portable en fase 5, con mediciones de memoria y ejecución.

## Alternativas

| Opción | Evaluación |
|---|---|
| Copiar cada resultado a una tabla DuckDB | Evita recalcular cada consulta, pero cada versión puede consumir memoria proporcional al dataset. Se pospone hasta medir casos de uso R2. |
| Vistas derivadas en DuckDB | Evitan duplicar filas y mantienen el linaje durante la sesión; las consultas posteriores pueden volver a ejecutar pasos. Adoptada para el primer corte. |
| Persistir de inmediato en OPFS | Aumenta alcance de recuperación, migraciones y manejo de cuotas antes de definir exportación portable. Diferida a fase 5. |

## Consecuencias y límites

- Un error al validar o crear una vista no cambia la versión activa; la fuente y las vistas previas existentes siguen disponibles.
- Reimportar reemplaza de forma transaccional el dataset de sesión y elimina primero las vistas derivadas.
- Las versiones desaparecen al cerrar el Worker o recargar. La definición del pipeline no sobrevive a la vista actual ni se guarda en el proyecto.
- Las vistas pueden recalcular transformaciones en cada lectura; este corte no acredita rendimiento ni capacidad para grandes cadenas.
- No se consideran completados los criterios completos de fase 4: faltan tratamiento de nulos/tipos, persistencia de definiciones, varios datasets y validaciones de UNION/JOIN.

## Evidencia de implementación

El corte se verificó con `npm run typecheck`, `npm run lint`, `npm test` (52/52),
`npm run build`, Playwright (72/72) sobre el build estático en Chromium y
Firefox y `npm run smoke:static` (36/36 en Chromium). Estas funciones continúan
fuera de la demo pública R1.

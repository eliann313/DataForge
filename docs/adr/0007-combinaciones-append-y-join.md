# ADR-0007 — Semántica y validación de APPEND/JOIN

- **Estado:** Aceptado localmente (2026-10-12, PR #16; pendiente de revisión e integración).
- **Relacionados:** [ADR-0004](./0004-versiones-derivadas-de-pipelines.md), [ADR-0006](./0006-multiples-datasets-en-sesion.md), [roadmap](../roadmap.md).

## Contexto

Combinar tablas puede perder datos por mapeos implícitos o multiplicar importes si se unen filas sin revisar la cardinalidad. La fase 4 necesita relaciones comprobadas antes de ejecutar, una vista previa acotada y linaje que incluya todas las entradas.

## Hechos verificados

- Los esquemas y tipos físicos están disponibles antes de crear una vista combinada.
- DuckDB permite expresar APPEND/JOIN como vistas; no es necesario copiar físicamente las filas en esta fase.
- Los identificadores SQL deben escaparse y los tipos SQL deben proceder de un conjunto cerrado, nunca de texto arbitrario.

## Decisión

### APPEND / UNION

- Implementar `UNION ALL`: conservar filas repetidas y no aplicar deduplicación implícita.
- Exigir un mapeo explícito de columnas de izquierda/derecha a nombres de salida únicos; una columna ausente en uno de los lados se proyecta como `NULL` con el tipo seguro de salida.
- Aceptar tipos idénticos, ensanchamiento de enteros, `FLOAT` a `DOUBLE` y ensanchamiento decimal exacto dentro del límite de precisión. Rechazar combinaciones no demostrablemente seguras.

### JOIN

- Soportar `INNER JOIN` y `LEFT JOIN`; posponer otros tipos.
- Exigir de 1 a 10 pares de claves existentes con tipos SQL compatibles idénticos después de normalizar alias.
- Exigir que se declare cardinalidad `uno a uno`, `muchos a uno` o `uno a muchos`; comprobar unicidad de claves no nulas en el lado que debe ser único.
- Calcular las filas extra causadas por claves repetidas del lado muchos. La vista previa presenta conteos de ambos lados, resultado y fanout. Si el fanout es mayor que cero, deshabilitar la creación hasta que el usuario lo confirme; el adaptador repite la comprobación y rechaza la ejecución sin confirmación.
- Proyectar columnas con nombres de salida únicos y escapados; no aceptar SQL libre.

### Linaje y fallos

- Registrar ambos padres inmediatos, el tipo de operación y la unión de todas las fuentes originales.
- Crear la vista primero, leer conteo y esquema, y agregar metadatos/activar solo cuando todo terminó bien. Ante un error, quitar la vista provisional y conservar el estado previo.

## Alternativas

| Opción | Evaluación |
|---|---|
| `UNION` con deduplicación automática | Oculta filas repetidas y aumenta el costo; descartada. |
| JOIN sin declarar cardinalidad | No permite advertir multiplicación accidental; descartada. |
| Aceptar cardinalidad y confiar solo en la selección del usuario | Puede describir datos incorrectos; se comprueba unicidad en el motor. |
| Bloquear todo JOIN con fanout | Impide casos uno-a-muchos intencionales; se permite solo con vista previa y confirmación explícita. |

## Consecuencias y límites

- Las combinaciones son vistas de sesión y se pierden al cerrar/recargar el Worker.
- `UNION ALL` conserva duplicados; el usuario puede deduplicar después mediante un paso separado del pipeline.
- El JOIN de fase 4 no admite `FULL`, `RIGHT` ni cardinalidad muchos-a-muchos declarada.
- La confirmación de fanout advierte sobre filas duplicadas; no interpreta semánticamente importes ni garantiza que repetir una métrica sea correcto para el análisis.

## Verificación

Vitest pasó 67/67 y la suite Playwright de pipelines pasó 32/32 en Chromium y Firefox el 2026-10-12. Los E2E comprueban `UNION ALL`, mapeo con columnas ausentes, rechazo por cardinalidad errónea, fanout detectado y confirmación obligatoria antes de crear la vista.

# ADR-0016 — Catálogo local de categorías y movimientos destacados

- **Estado:** Propuesto para el siguiente corte de fase 6; sujeto a revisión antes del cierre de fase.
- **Fecha:** 2026-11-05.
- **Relacionados:** [ADR-0013](./0013-finance-accounts-and-transfer-migration.md), [ADR-0014](./0014-finance-local-file-import.md), [Roadmap fase 6](../roadmap.md).

## Contexto

Las categorías se guardan como texto en cada movimiento y aparecen como sugerencias en el formulario. Hacer de cada movimiento un catálogo implícito pierde consistencia de escritura y una migración no debe alterar registros históricos. También se necesitan acciones rápidas para volver a movimientos frecuentes sin confundir una copia con una edición del original.

## Decisión

- Mantener el texto original de categoría en cada movimiento como snapshot histórico.
- Agregar un object store local de categorías. Su clave recorta espacios y convierte a minúsculas con locale `es-AR`; la comparación distingue acentos. La primera categoría con cada clave provee el nombre sugerido, recortado.
- Migrar las categorías existentes durante IndexedDB v3→v4 sin reescribir los movimientos previos.
- Persistir el catálogo y el movimiento en la misma transacción al guardar o importar. Un fallo aborta ambas escrituras.
- Permitir duplicar un movimiento como una nueva alta, con un ID y fecha de creación propios, y destacar/quitar el destacado de un movimiento para mostrarlo en el dashboard.
- Mantener las categorías en el dispositivo. Esta versión no ofrece administración independiente para renombrarlas o eliminarlas; las sugerencias nacen de movimientos guardados.

## Consecuencias y límites

La normalización reduce variantes por mayúsculas y espacios en los extremos, conserva distinciones ortográficas por acento y no modifica informes o movimientos históricos. La duplicación precarga los datos de origen en un formulario nuevo y las reglas de dominio vuelven a validar reintegros y transferencias al guardar. Los destacados son una propiedad local del movimiento; no son una clasificación financiera ni alteran saldos o informes.

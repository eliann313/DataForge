# ADR-0010: Informes locales basados en snapshots

- **Estado:** Propuesto
- **Fecha:** 2026-11-04
- **Contexto:** fase 5 requiere informes editables y exportables. Los datasets y versiones viven en memoria durante la sesión; los snapshots de análisis son resultados tipados, congelados y persistidos localmente.

## Decisión

- Guardar en IndexedDB por proyecto la definición del informe: título, orden de secciones, texto editorial y referencias `snapshotId`.
- Obtener snapshots mediante el puerto público de análisis, con búsqueda acotada por `projectId` y `snapshotId`. El módulo reports no vuelve a calcular ni copia resultados como fuente de verdad.
- Incluir en el HTML exportado los parámetros, la fuente, el esquema y los resultados que existían en el snapshot. Escapar todo valor dinámico como texto HTML.
- Si la referencia ya no existe en el proyecto, conservarla y representar una nota explícita de snapshot no disponible.
- El HTML descargado ofrece una opción del navegador para imprimir o guardar como PDF; no se invoca impresión automáticamente.

## Consecuencias y límites

- Los informes son reproducibles respecto de los resultados congelados del snapshot, no respecto del archivo de origen. No conservan datos fuente, artefactos de gráfico como imagen ni una copia del proyecto.
- CSV/Parquet procesado se exporta desde Transformaciones; el HTML no duplica ni incorpora archivos tabulares.
- La importación/exportación portable del proyecto y adjuntos gráficos quedan pendientes. La decisión se revisará al cerrar fase 5.
- IndexedDB está sujeto a las cuotas y políticas del navegador.

## Verificación

- Tests cubren el aislamiento por proyecto, referencias a snapshots y renderizado HTML escapado frente a etiquetas, atributos y texto hostil.
- Aún debe verificarse el recorrido integrado en navegador al apilar este corte sobre la persistencia de snapshots.

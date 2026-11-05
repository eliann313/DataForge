# ADR-0010: Informes locales basados en snapshots

- **Estado:** Aceptado — cierre de fase 5 (2026-11-05).
- **Fecha:** 2026-11-04
- **Contexto:** fase 5 requiere informes editables y exportables. Los datasets y versiones viven en memoria durante la sesión; los snapshots de análisis son resultados tipados, congelados y persistidos localmente.

## Decisión

- Guardar en IndexedDB por proyecto la definición del informe: título, orden de secciones, texto editorial y referencias `snapshotId`.
- Validar datos persistidos/corruptos: como máximo 100 secciones, 20 snapshots referenciados, 100.000 caracteres por sección editorial, 200 por título y 1 MiB por definición guardada.
- Obtener snapshots mediante el puerto público de análisis, con búsqueda acotada por `projectId` y `snapshotId`. El módulo reports no vuelve a calcular ni copia resultados como fuente de verdad.
- Incluir en el HTML exportado los parámetros, el linaje completo de fuentes/versiones/pasos, el esquema y los resultados que existían en el snapshot. Escapar todo valor dinámico como texto HTML.
- Presentar descriptivos, frecuencias, correlaciones y hallazgos en tablas/listas legibles. Para gráficos bar/line soportados, regenerar SVG desde los puntos numéricos guardados con geometría fija, etiquetas escapadas y tabla de valores; limitar la figura a 500 puntos. No incrustar HTML/SVG recibido del snapshot, scripts externos ni imágenes remotas.
- Si la referencia ya no existe en el proyecto, conservarla y representar una nota explícita de snapshot no disponible.
- El HTML descargado ofrece una opción del navegador para imprimir o guardar como PDF; no se invoca impresión automáticamente.
- Limitar el HTML generado a 5 MiB; mostrar errores de serialización/descarga y liberar la URL Blob después de iniciar la descarga.

## Consecuencias y límites

- Los informes son reproducibles respecto de los resultados congelados del snapshot, no respecto del archivo de origen. No conservan datos fuente, una copia del proyecto ni imágenes rasterizadas de los gráficos; el SVG se reconstruye desde los puntos congelados.
- CSV/Parquet procesado se exporta desde Transformaciones; el HTML no duplica ni incorpora archivos tabulares.
- La importación/exportación portable de metadatos se define en ADR-0011; la exportación opcional de versiones materializadas, en ADR-0012. Son archivos separados y no asocian automáticamente versiones restauradas con snapshots o informes. El HTML del informe reconstruye los gráficos soportados desde datos congelados; no transporta adjuntos gráficos independientes.
- Este corte no importa definiciones de informes; la validación protege los datos cargados desde el almacenamiento local.
- IndexedDB está sujeto a las cuotas y políticas del navegador.

## Verificación

- Tests cubren el aislamiento por proyecto, referencias a snapshots, renderizado legible de resultados, SVG limitado y HTML escapado frente a etiquetas, atributos y texto hostil. El E2E comprueba navegación, guardado y descarga HTML imprimible.
- El recorrido integrado en navegador cubre navegación, guardado, resultados del snapshot y descarga HTML imprimible. La exportación refleja el snapshot congelado; no prueba reproducibilidad desde las fuentes originales.

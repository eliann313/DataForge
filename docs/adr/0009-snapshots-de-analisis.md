# ADR-0009: Snapshots locales de resultados de análisis

- **Estado:** Aceptado — primer corte de fase 5
- **Fecha:** 2026-11-04

## Contexto

Los archivos, versiones DuckDB y roles semánticos viven en el Worker y desaparecen al cerrar o recargar. La fase 5 requiere conservar análisis con su versión, parámetros y resultados, pero todavía no conserva archivos ni versiones ejecutables.

## Decisión

Guardar por proyecto en IndexedDB un `AnalysisSnapshot` con ID, fecha, título, referencia a `versionId`, `sourceId` y un `sessionId` aleatorio de la sesión de UI, nombre y esquema del dataset, parámetros y resultados JSON calculados. El módulo `analysis` publica el DTO, `SnapshotValue`, el puerto `AnalysisSnapshotRepository` (`save`, `list`, `findById(projectId, snapshotId)`, `delete`) y su adaptador IndexedDB.

El registro guarda los resultados ya calculados para lectura histórica; no vuelve a ejecutar el análisis. Al recargar, la interfaz muestra ese artefacto y marca la fuente como no disponible. El `sessionId` evita falsos vínculos si los IDs secuenciales de versiones se repiten después de reiniciar. Reimportar un archivo, aunque tenga el mismo nombre, no lo vincula automáticamente: las referencias de versión son identificadores de sesión, no hashes del contenido. Para reproducibilidad futura hace falta el respaldo portable y una estrategia de identidad/recuperación de archivos que aún no existe.

Se aceptan únicamente datos JSON finitos, hasta 32 niveles, arreglos de hasta 100.000 entradas y snapshots de hasta 2 MiB. No se admiten `BigInt`, `Date`, valores no finitos ni objetos de prototipo personalizado. IndexedDB guarda metadatos/resultados, nunca bytes de datasets.

## Consecuencias

- Los snapshots sobreviven la recarga dentro del mismo almacenamiento local, sujetos a cuotas y políticas del navegador.
- El borrado de un proyecto no limpia esta base de datos separada. Como los IDs de proyecto son UUID y cada consulta exige la clave exacta del proyecto, los snapshots huérfanos no se muestran ni se atribuyen a otro proyecto; permanecen ocupando almacenamiento y ya no se pueden gestionar desde la interfaz. La limpieza coordinada queda pendiente hasta disponer de una operación de borrado que abarque ambos almacenes y gestione fallos entre ellos.
- Reportes y respaldo pueden referenciarlos por DTO/ID sin crear un modelo de resultados duplicado.
- El vínculo a los datos documenta procedencia, pero no certifica que los bytes originales sigan disponibles ni que se pueda repetir el cálculo.
- Un snapshot demasiado grande falla con error visible en lugar de indicar éxito.

## Revisión

Al incorporar respaldo portable, verificar importación y validación de snapshots; al decidir persistencia de datasets, definir hashes/identidad de contenido y reglas explícitas de relink antes de ofrecer reproducibilidad.

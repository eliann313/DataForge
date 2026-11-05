# ADR-0009: Snapshots locales de resultados de análisis

- **Estado:** Aceptado — primer corte de fase 5
- **Fecha:** 2026-11-04

## Contexto

Los archivos, versiones DuckDB y roles semánticos viven en el Worker y desaparecen al cerrar o recargar. La fase 5 requiere conservar análisis con su versión, parámetros y resultados, pero todavía no conserva archivos ni versiones ejecutables.

## Decisión

Guardar por proyecto en IndexedDB un `AnalysisSnapshot` con ID, fecha, título, referencia a `versionId`, `sourceId` y un `sessionId` aleatorio de la sesión de UI, nombre y esquema del dataset, parámetros y resultados JSON calculados. La procedencia incluye `source.lineage`: subgrafo validado de antecesores disponibles, ordenado padres→hijo, con ID/nombre/tipo de operación, IDs de fuentes y padres, metadatos de filas/columnas y copia de cada definición ejecutada de pipeline. El límite es de 256 nodos; no se guarda SQL ni contenido de archivos. Si falta un padre, hay ciclo, proyecto ajeno o el grafo excede el límite, no se permite guardar. El módulo `analysis` publica el DTO, `SnapshotValue`, el puerto `AnalysisSnapshotRepository` (`save`, `list`, `findById(projectId, snapshotId)`, `delete`) y su adaptador IndexedDB.

El registro guarda los resultados ya calculados para lectura histórica; no vuelve a ejecutar el análisis. Al recargar, la interfaz muestra ese artefacto y marca la fuente como no disponible. El `sessionId` evita falsos vínculos si los IDs secuenciales de versiones se repiten después de reiniciar. Reimportar un archivo, aunque tenga el mismo nombre, no lo vincula automáticamente: las referencias de versión son identificadores de sesión, no hashes del contenido. Para reproducibilidad futura hace falta el respaldo portable y una estrategia de identidad/recuperación de archivos que aún no existe.

Se aceptan únicamente datos JSON finitos, hasta 32 niveles, arreglos de hasta 100.000 entradas y snapshots de hasta 2 MiB. No se admiten `BigInt`, `Date`, valores no finitos ni objetos de prototipo personalizado. IndexedDB guarda metadatos/resultados, nunca bytes de datasets.

## Consecuencias

- Los snapshots sobreviven la recarga dentro del mismo almacenamiento local, sujetos a cuotas y políticas del navegador.
- Al borrar un proyecto, la aplicación elimina primero sus metadatos y luego ejecuta una transacción IndexedDB que borra snapshots por la clave exacta de proyecto. Las dos bases no comparten transacción: si falla la segunda operación, se informa que el proyecto ya se eliminó y se ofrecen reintentos en la sesión activa. Un cierre/crash en la ventana entre ambas operaciones puede dejar snapshots huérfanos; los IDs UUID y el borrado indexado exacto evitan mostrar o eliminar snapshots de otros proyectos. Al recargar se pierde el estado del reintento y no se hace barrido automático.
- Reportes y respaldo pueden referenciarlos por DTO/ID sin crear un modelo de resultados duplicado.
- El vínculo a los datos documenta procedencia, pero no certifica que los bytes originales sigan disponibles ni que se pueda repetir el cálculo.
- Un snapshot demasiado grande falla con error visible en lugar de indicar éxito.

## Revisión

Al incorporar respaldo portable, verificar importación y validación de snapshots; al decidir persistencia de datasets, definir hashes/identidad de contenido y reglas explícitas de relink antes de ofrecer reproducibilidad. Para eliminar la ventana de huérfanos tras un cierre abrupto, mover los registros de proyecto/snapshots a una transacción común o añadir un journal/outbox persistente que registre la eliminación y permita reintentar tras recargar, procesándolo solo después de leer correctamente ambos almacenes.

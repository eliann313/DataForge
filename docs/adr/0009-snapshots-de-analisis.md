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
- El borrado de usuario escribe un intent persistente y elimina los metadatos del proyecto en una misma transacción de la base `dataforge` (esquema v2). Después se purgan snapshots, definiciones e informes con transacciones locales separadas, siempre por `projectId` exacto; el intent se borra solo al completar todos los purges. Al iniciar, la app intenta recuperar intents después de leer correctamente proyectos; si un ID sigue activo, bloquea la limpieza y lo informa. Un fallo conserva el intent y permite reintentar incluso tras recargar.
- Los almacenes de artefactos no comparten transacción. Un crash puede dejar algunos stores ya limpiados y otros pendientes; repetir la limpieza es idempotente. Los IDs UUID, el chequeo contra proyectos activos y las claves exactas evitan borrar datos de otro proyecto. La importación portable debe conservar `ProjectRepository.delete` como borrado crudo para su rollback compensatorio y usar un UUID nuevo; no crea intents de borrado de usuario.
- El journal coordina fallos y recargas, pero no bloquea escrituras concurrentes de otras pestañas. Una pestaña que conserva el proyecto activo puede guardar un snapshot, informe o definición mientras se ejecutan los purges, o incluso después de que el intent se haya completado. Si esa escritura queda ordenada después del purge de su base, el artefacto queda huérfano bajo el UUID borrado: no se atribuye a otro proyecto, pero ya no aparece en la lista ni se vuelve a limpiar automáticamente. No hay garantía de atomicidad entre pestañas ni entre las bases.
- Para evitar esa carrera en una iteración futura, cada base de artefactos necesitaría un tombstone por proyecto y validar su ausencia en la misma transacción IndexedDB que escribe el artefacto. El purge tendría que registrar el tombstone y borrar filas dentro de esa misma transacción local; conservarlo evita que una pestaña obsoleta vuelva a escribir después. Esto coordinaría escrituras y borrado por base, pero no haría atómico el proceso entre bases; el journal seguiría necesario para reintentos. Un `BroadcastChannel` puede avisar antes a otras pestañas, pero por sí solo no es una barrera durable.
- Reportes y respaldo pueden referenciarlos por DTO/ID sin crear un modelo de resultados duplicado.
- El vínculo a los datos documenta procedencia, pero no certifica que los bytes originales sigan disponibles ni que se pueda repetir el cálculo.
- Un snapshot demasiado grande falla con error visible en lugar de indicar éxito.

## Revisión

El respaldo portable conserva su rollback crudo (`ProjectRepository.delete`) sin generar intents, y sus pruebas deben cubrir esa separación junto con remapeo de snapshots/linaje. Cada adapter expone `deleteProject(projectId)` transaccional e idempotente; el intent se conserva hasta terminar todos los stores. La base de proyectos v2 crea el journal durante upgrade y actualiza `meta.schemaVersion`; las conexiones anteriores deben cerrar en `versionchange`. Persisten como límites la cuota/limpieza manual completa del navegador, el posible fallo de un store externo (deja un intent reintentable) y las escrituras de pestañas obsoletas (pueden dejar huérfanos; no se afirma atomicidad entre pestañas). Para cerrar esta última carrera hace falta tombstone y validación dentro de la transacción de escritura de cada base.

# ADR-0012 — Respaldo portable opcional de datasets materializados

- **Estado:** Propuesto; implementación experimental, no cierra fase 5.
- **Fecha:** 2026-11-05
- **Relacionado:** [ADR-0003](./0003-persistencia-opfs-diferido.md), [ADR-0007](./0007-combinaciones-append-y-join.md), [ADR-0009](./0009-respaldo-portable-v1-metadatos.md).

## Contexto

El respaldo portable v1 de metadatos excluye bytes de datasets. Las fuentes,
resultados de pipelines y resultados de combinaciones solo viven en la sesión
DuckDB. Se necesita una opción separada para mover datos materializados, sin
cambiar el contrato de `dataforge-project-backup` ni asociarlos a snapshots o
informes por nombre o por identificadores de una sesión anterior.

## Hechos verificados

- Chromium exporta e importa un archivo `.dfdataset` con una fuente CSV y una
  versión materializada de deduplicación; se verificaron filas, vista previa,
  linaje y rechazo de un payload alterado antes de escribir.
- La escritura Parquet en Chromium conserva `DECIMAL(38,2)`, `DATE`,
  `TIMESTAMP_NS` y un valor `HUGEINT` calculado superior al rango de `BIGINT`.
- Cada Parquet exportado se lee por batches Arrow y el byte acumulado se limita
  antes de formar el Blob. El empaquetador concatena blobs sin Base64 y limita
  cada versión a 20 MiB, la carga total a 50 MiB, el manifiesto a 2 MiB, a 64
  versiones y a 512 columnas por versión. La importación verifica SHA-256 por
  asset antes de modificar el Worker y lee cada asset como máximo una vez por
  buffer de hasta 20 MiB.
- Estas cotas limitan buffers y archivos del flujo de la aplicación; no son un
  límite global de memoria del proceso. DuckDB/WASM, Arrow, el navegador y la
  implementación de `Blob` pueden mantener memoria adicional que esta app no
  mide ni controla. No se afirma un máximo de memoria total.
- El experimento inicial de restauración detectó una colisión de caché: se
  reutilizaba el nombre virtual `df_upload.parquet` y DuckDB leyó 2 filas del
  asset anterior al importar otro que debía tener 3. Asignar un nombre virtual
  UUID distinto por asset hizo pasar la E2E completa en Chromium.
- La cobertura todavía no valida restauración de grafos con `JOIN`, `APPEND` ni
  resultados materializados de pipeline con múltiples fuentes. La importación
  reatacha IDs del manifiesto mediante referencias explícitas, pero ese
  contrato de grafo no se considera validado hasta cubrir esos casos.

## Decisión propuesta

Usar un formato binario autónomo `.dfdataset` que transporta Parquet
materializado por versión junto a un manifiesto versionado. Cada asset tiene
una referencia aleatoria local al archivo, longitud y SHA-256. El manifiesto
conserva un `sessionId` opaco del archivo y el `versionId` de origen como
identidad histórica y describe las relaciones entre versiones por referencias
internas del archivo. Ese `sessionId` no es la identidad de sesión de snapshots
y no permite correlacionarlos.
La importación asigna nuevos IDs de sesión y devuelve mapas explícitos entre
las identidades de origen y las versiones materializadas importadas. No busca
ni vincula proyectos por nombre, IDs secuenciales ni coincidencias heurísticas.

Las operaciones consultan y escriben por el ID explícito del proyecto, sin
cambiar el proyecto activo global durante el proceso. Al terminar, el proyecto
que el usuario haya seleccionado entretanto conserva el foco; el destino
importado queda disponible al seleccionarlo. El usuario selecciona el proyecto
destino y confirma la importación. El
respaldo de datasets se presenta separado del respaldo de metadatos; explica
qué datos recupera y qué excluye. Los bytes importados quedan solo en la sesión
activa de DuckDB. No se asocian automáticamente a snapshots o informes. El
formato no promete compatibilidad universal de tipos ni atomicidad entre bases
de metadatos y el Worker DuckDB. Si una escritura falla, se intenta retirar las
versiones nuevas; errores entre bases o durante el cierre del navegador pueden
impedir rollback completo.

La escritura/importación rechaza archivos fuera de límites y valida
checksums, esquema, conteo y referencias antes de aceptar el resultado. Si una
versión no supera esa validación, se limpia el material recién importado en la
medida disponible y se informa el error.

## Consecuencias y trabajo pendiente

- El archivo respalda versiones materializadas, no fuentes originales ni
  definiciones reejecutables. Los resultados se pueden consultar, pero no se
  afirma que sean reproducibles desde su receta.
- Hay que agregar pruebas Chromium para resultados de `JOIN`, `APPEND` y
  pipelines que combinen fuentes antes de declarar restauración de grafo
  completa.
- Deben medirse límites prácticos de tamaño y memoria en navegadores objetivo;
  los topes actuales de bytes no garantizan memoria total acotada.
- Debe decidirse si datos de sesión importados pasan a almacenamiento
  persistente. El archivo no modifica el alcance de OPFS definido en ADR-0003.
- Snapshots e informes continúan en el formato de metadatos separado y no
  reciben asociaciones automáticas a los IDs nuevos.

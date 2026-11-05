# ADR-0003 — Persistencia local: IndexedDB sí, OPFS diferido

- **Estado:** Aceptado; reafirmado al cerrar fase 5 (2026-11-05).
- **Fecha:** 2026-10-12
- **Relacionados:** [Arquitectura §7](../architecture.md), [primeras entregas](../primeras-entregas.md) (E3), [ADR-0011](./0011-respaldo-portable-v1-metadatos.md), [ADR-0012](./0012-respaldo-portable-de-datasets.md)

## Contexto

R1 necesita metadatos de proyectos persistentes y un relato honesto sobre qué
sobrevive a una recarga. Los datasets importados viven en el Worker de DuckDB
(en memoria). La pregunta era si persistir archivos/datasets con OPFS ya en R1.

## Hechos verificados (sonda 2026-10-12, rama `develop`)

Sonda puntual en navegador (escritura/lectura/borrado de `df-sonda.txt` + `estimate()`):

| Navegador | OPFS | Roundtrip | `estimate()` |
|---|---|---|---|
| Chromium 156 (headless-shell) | sí | ok (21 bytes) | uso 73.728, cuota 10.737.491.968 (~10 GB) |
| Firefox 157 | sí | ok (21 bytes) | uso 573.568, cuota 10.737.418.240 (~10 GB) |

Equipo: Windows 11 x64. La sonda no es comportamiento de producto (sin código
comprometido); el Inspector muestra la cuota real vía `storage.estimate()`.

## Decisión

- **R1:** metadatos en IndexedDB (esquema v1, una transacción por operación,
  errores visibles, E3.1–E3.3); datasets solo en memoria con reimportación
  explícita; cuota observable en el Inspector.
- **R2/fase 4 inicial:** las transformaciones crean vistas derivadas en DuckDB
  dentro del Worker. La fuente permanece intacta; metadatos de versión y pasos
  duran únicamente en la sesión. No se agrega OPFS ni caché implícita. Ver
  [ADR-0004](./0004-versiones-derivadas-de-pipelines.md).
- **R2/fase 5:** se mantienen datasets y versiones analíticas en memoria del
  Worker, sin persistencia durable en OPFS ni IndexedDB. La portabilidad se
  ofrece mediante dos archivos explícitamente separados: el JSON v1 para
  metadatos, snapshots e informes, y el `.dfdataset` opcional para versiones
  Parquet materializadas de una sesión. La importación `.dfdataset` recupera
  las versiones solo en la sesión activa; no las reconecta automáticamente
  con snapshots ni informes. Ver [ADR-0011](./0011-respaldo-portable-v1-metadatos.md)
  y [ADR-0012](./0012-respaldo-portable-de-datasets.md).

## Criterios y descarte

- Ningún caso de uso R1 exige conservar bytes entre sesiones: reimportar un
  CSV/XLSX es explícito y barato según benchmarks 0A.5.
- OPFS añade semántica de desalojo/cuota por navegador sin valor de usuario
  en R1; adoptarlo ahora sería infraestructura especulativa.
- La exportación portable opcional satisface la necesidad de mover versiones
  materializadas sin hacer de OPFS una dependencia de persistencia. Un uso que
  requiera conservar datasets después de cerrar el navegador queda fuera de
  esta decisión y requerirá revisar este ADR con evidencia de capacidad y
  cuotas.

## Consecuencias

- La UI debe explicar qué conserva cada respaldo y que los datos reimportados
  viven solo durante la sesión. Las cotas del formato `.dfdataset` (20 MiB por
  versión, 50 MiB totales) limitan buffers/archivo de la aplicación, no la
  memoria total del proceso. No se afirma un máximo de memoria ni capacidad
  garantizada; faltan mediciones de capacidad en navegadores objetivo.
- No se implementa OPFS para datasets en esta entrega. Agregar persistencia
  durable requiere una decisión posterior con evidencia de capacidad y cuotas.

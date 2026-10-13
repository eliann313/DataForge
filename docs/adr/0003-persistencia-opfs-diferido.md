# ADR-0003 — Persistencia local: IndexedDB sí, OPFS diferido

- **Estado:** Aceptado (2026-10-12, cierra el punto de decisión de E3).
- **Fecha:** 2026-10-12
- **Relacionados:** [Arquitectura §7](../architecture.md), [primeras entregas](../primeras-entregas.md) (E3)

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
- **Persistencia duradera:** se decidirá al diseñar respaldo/exportación
  portable de fase 5, usando los requisitos y mediciones de los flujos R2.

## Criterios y descarte

- Ningún caso de uso R1 exige conservar bytes entre sesiones: reimportar un
  CSV/XLSX es explícito y barato según benchmarks 0A.5.
- OPFS añade semántica de desalojo/cuota por navegador sin valor de usuario
  en R1; adoptarlo ahora sería infraestructura especulativa.
- Se reconsiderará antes de cerrar fase 5 si un flujo de respaldo portable o
  datasets grandes recurrentes lo justifica con mediciones.

## Consecuencias

- La UI debe decir qué se conserva entre sesiones. El primer corte R2 no guarda
  las versiones derivadas al recargar; el respaldo portable se resolverá en fase 5.
  Fallos de cuota/escritura son visibles, nunca silenciosos.
- No se escribe código OPFS hasta decidir el respaldo portable y la persistencia en la fase 5.

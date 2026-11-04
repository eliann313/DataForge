# ADR-0009 — Respaldo portable v1 de metadatos de proyecto

- **Estado:** Aceptado para un primer corte limitado; no cierra la fase 5.
- **Fecha:** 2026-11-04
- **Relacionado:** [ADR-0003](./0003-persistencia-opfs-diferido.md), fase 5 del [roadmap](../roadmap.md).

## Contexto

La fase 5 requiere una forma portable de recuperar proyectos. Actualmente los
bytes de fuentes y las versiones derivadas viven solo en la sesión DuckDB; las
definiciones de pipeline y los metadatos de proyecto sí están en IndexedDB.
Los snapshots e informes aún no forman parte del modelo persistido integrado.

## Decisión

El formato JSON `dataforge-project-backup`, versión 1, transfiere el nombre del
proyecto y sus definiciones declarativas de pipeline. Importar crea un proyecto
nuevo en la raíz y conserva los identificadores de receta, sin sustituir un
proyecto existente. El manifiesto declara explícitamente que no lleva bytes de
datasets ni snapshots. Se limita a 5 MiB y 500 definiciones; las recetas se
validan con el validador del dominio antes de escribirlas. No admite SQL libre.

La importación guarda las recetas bajo un UUID nuevo y publica los metadatos del
proyecto al final. Si falla una escritura, intenta borrar las recetas ya
guardadas y muestra el error. Proyectos y pipelines residen en bases IndexedDB
separadas: no hay una transacción atómica entre ambas. Si la pestaña o el
navegador se cierran tras confirmar las recetas y antes de guardar el proyecto,
pueden quedar recetas huérfanas sin proyecto visible. Cierres durante la
compensación también pueden dejar datos huérfanos. No se sobrescriben metadatos
de proyectos existentes; como el repositorio actual no ofrece reserva atómica
de IDs entre pestañas, se usa UUID aleatorio y se rechaza una colisión ya
existente antes de empezar. La garantía sigue siendo de sesión local simple,
no multi-pestaña.

El formato está versionado para añadir snapshots e informes cuando sus
repositorios estén disponibles. Esa ampliación requiere una nueva versión o una
extensión explícita del manifiesto y pruebas de importación/rollback. La versión
1 no es una copia de seguridad completa ni una garantía de recuperación de los
datos analíticos.

## Consecuencias y trabajo pendiente

- El usuario debe reimportar cada archivo de origen; las recetas no se pueden
  ejecutar hasta que las fuentes requeridas estén disponibles.
- Resultados calculados, snapshots e informes no se restauran en v1.
- La decisión de OPFS o persistencia de bytes permanece abierta según ADR-0003.
- La fase 5 sigue pendiente de Report Builder, snapshots persistentes y un
  respaldo portable que incluya los artefactos que el producto decida conservar.
- La interfaz describe el alcance antes de importar/exportar y el parser
  rechaza formatos, manifiestos, recetas y tamaños inválidos.

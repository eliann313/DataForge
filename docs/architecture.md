# DataForge — Arquitectura de software

> **Estado:** propuesta arquitectónica. Se validará en fase 0; no implica que los componentes ya estén desarrollados.

## 1. Estilo arquitectónico

**Monolito modular client-side, organizado por dominios (Screaming Architecture / feature-first), con capas y principios hexagonales pragmáticos.**

- La estructura debe expresar **qué hace** DataForge: proyectos, datasets, análisis, pipelines, informes, finanzas, ventas y encuestas.
- El dominio no depende de Next.js, React, IndexedDB, DuckDB, Pyodide, Rust ni Neon.
- Los casos de uso declaran puertos; los adaptadores concretos los implementan.
- Cada módulo presenta una API pública explícita y protege sus detalles internos.
- No generar cinco capas para un componente presentacional simple; evitar interfaces especulativas.
- App Router actúa como composición/navegación, **no** como residencia de reglas de negocio.
- Los motores son infraestructura, no el modelo de dominio.

## 2. Capas y dependencia

| Capa | Responsabilidad | Dependencias permitidas |
|---|---|---|
| \`domain/\` | Entidades, objetos de valor, invariantes y reglas puras | Código estándar / tipos de dominio |
| \`application/\` | Casos de uso, DTO y puertos necesarios | Dominio y contratos |
| \`infrastructure/\` | Implementaciones de repositorios, mapeadores y adaptadores | Aplicación, dominio, plataforma |
| \`presentation/\` | Vistas, componentes, hooks, formularios | Casos de uso y contratos públicos |
| \`index.ts\` | API pública del módulo | Exportaciones explícitas |

Los puertos se definirán preferentemente junto al caso de uso que los necesita (por ejemplo \`application/ports/\`). No crear una capa de abstracción global para todo.

\`\`\`mermaid
flowchart TD
  UI["Presentación: React / Next.js"] --> UC["Aplicación: casos de uso"]
  UC --> DOM["Dominio: reglas y entidades"]
  UC --> PORT["Puertos / interfaces"]
  AD["Adaptadores: IndexedDB, OPFS, DuckDB, APIs"] -. "implementan" .-> PORT
  AD --> DOM
\`\`\`

La dirección de dependencia está definida a nivel de importaciones de código: el dominio nunca importa implementaciones de infraestructura.

## 3. Estructura objetivo

\`\`\`text
DataForge/
├── README.md
├── public/
│   └── demo-data/
├── src/
│   ├── app/                       # Next.js: landing, demo y rutas del workspace
│   ├── modules/
│   │   ├── projects/
│   │   ├── datasets/
│   │   ├── analysis/
│   │   ├── pipelines/
│   │   ├── reports/
│   │   ├── finance/
│   │   ├── sales/
│   │   ├── surveys/
│   │   ├── forecasting/
│   │   ├── time-series/
│   │   └── optimization/
│   ├── platform/
│   │   ├── engines/
│   │   │   ├── duckdb/
│   │   │   ├── python/
│   │   │   └── rust/
│   │   ├── workers/
│   │   ├── storage/
│   │   │   ├── indexeddb/
│   │   │   └── opfs/
│   │   ├── integrations/
│   │   └── composition/
│   └── shared/
│       ├── kernel/
│       ├── ui/
│       ├── formatting/
│       └── validation/
├── python/
│   ├── statistics/
│   ├── forecasting/
│   └── optimization/
├── rust/
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       ├── dtw.rs
│       └── distances.rs
├── tests/
├── e2e/
├── benchmarks/
├── docs/
│   ├── roadmap.md
│   ├── architecture.md
│   ├── prd.md                  # Futuro
│   ├── design/                # Futuro
│   └── adr/                   # Futuro
└── .github/
    └── workflows/
\`\`\`

**No crear directorios vacíos por anticipación.** La estructura se materializará al desarrollar las fases.

### Ejemplo de módulo con lógica relevante

\`\`\`text
modules/finance/
├── domain/
│   ├── entities/
│   ├── value-objects/
│   └── rules/
├── application/
│   ├── use-cases/
│   ├── ports/
│   └── dto/
├── infrastructure/
│   ├── repositories/
│   ├── adapters/
│   └── mappers/
├── presentation/
│   ├── components/
│   ├── hooks/
│   └── views/
└── index.ts
\`\`\`

## 4. Ejemplo de caso de uso: registrar un movimiento

1. Formulario de React recibe fecha, importe, moneda, categoría y cuenta.
2. Valida estructura de la entrada; el caso de uso **CreateTransaction** verifica reglas de dominio.
3. El caso de uso invoca un **TransactionRepository**, sin saber dónde se guardan los datos.
4. En modo local, un adaptador de IndexedDB persiste la transacción.
5. Cuando exista un modo conectado, otro adaptador podrá gestionar metadatos remotos sin cambiar las reglas financieras.
6. Un caso de uso de consultas actualiza las métricas; un movimiento entre cuentas propias no se cuenta como gasto.

Ejemplo orientativo de puerto:

\`\`\`ts
export interface TransactionRepository {
  save(transaction: Transaction): Promise<void>;
  findById(id: string): Promise<Transaction | null>;
  delete(id: string): Promise<void>;
}
\`\`\`

\`Transaction\` es un tipo del dominio de finanzas. La interfaz es ejemplo de diseño, no API ya implementada.

**Precisión monetaria:** no usar \`number\` binario sin reglas para sumar importes; preferir valor decimal o unidades menores y reglas explícitas de redondeo. Retener divisa original, moneda de presentación y snapshot de cotización por separado.

## 5. Contratos de motor analítico

### DuckDB-Wasm

- Fuente autorizada de datos tabulares activos en un workspace.
- Importación, SQL, profiling, agregaciones y ETL/ELT.
- En Worker para no bloquear interfaz.
- Consultas parametrizadas cuando corresponda; validación/escape de identificadores.
- Elegir columnas, filtros y agregaciones antes de enviar resultados al renderizador.

### Pyodide

- Estadística especializada, modelos y predicciones que justifiquen Python.
- Carga diferida en Worker, no iniciar en el shell de aplicación.
- Bibliotecas concretas validadas según compatibilidad, peso y consumo real.
- Enviar subconjuntos requeridos; no duplicar el workspace completo.

### Rust/Wasm

- DTW exacto/con ventana, distancias y algoritmos especializados.
- Bindings wasm-bindgen/wasm-pack; **no PyO3** para el navegador.
- Typed Arrays / buffers transferibles cuando sea adecuado.
- Pruebas numéricas de referencia y benchmarking de ejecución **más** transferencia/inicialización.

### Analytics Orchestrator

- Coordina contratos, Worker lifecycle, prioridades, progreso, errores y cancelación.
- Las operaciones contienen tipo, versión, parámetros y referencia de dataset, no objetos de bibliotecas técnicas expuestos al dominio.
- Metadatos JSON; Arrow IPC o formatos tipados para tablas; Typed Arrays para series; medir overhead.
- **No asumir zero-copy** entre memorias WASM independientes.
- Cancelar o reiniciar Workers según posibilidades reales de cada motor.
- No implementar orquestación distribuida ni microservicios.

## 6. Datos y proyectos

Entidades propuestas: Folder, Project, DatasetSource, DatasetVersion, DatasetSchema, SemanticColumn, PipelineDefinition, PipelineExecution, AnalysisSnapshot, Visualization, Report, DataLineage, UserPreferences.

- **DatasetSource:** fuente original no destructiva, su formato, tamaño y procedencia.
- **DatasetVersion:** resultado identificable de una transformación o unión.
- **AnalysisSnapshot:** parámetros, filtros, resultados y versión de datos.
- **Report:** secciones, evidencias, gráficos y metodología referenciados.
- **Folder/Project:** organización local, extensible luego a cuentas.
- **Plantillas:** configuración y esquemas propios de finanzas/ventas/encuestas sobre contratos de análisis generales.

Los identificadores y contratos de persistencia deben ser neutrales a implementación local o conectada. La importación y persistencia deben ser recuperables frente a fallos parciales.

## 7. Persistencia y privacidad

**Inicial:** IndexedDB para metadatos/configuración y OPFS para ficheros o estructuras tabulares según viabilidad; exportación/importación de proyectos como respaldo. La persistencia está sujeta a cuotas, limpieza por usuario/navegador y disponibilidad en dispositivo.

**Futuro opcional:** autenticación y Neon PostgreSQL para cuentas, carpetas y configuraciones sincronizadas; almacenamiento privado de objetos si se aprueba subir datasets. No usar PostgreSQL como repositorio principal de archivos grandes. Autorización por propietario verificada del lado del servidor. **Ningún archivo se sincroniza sin consentimiento.**

Las plantillas de finanzas contienen información potencialmente sensible. Evitar telemetría de contenido, exponer rutas de archivo y enviar datasets a APIs de cotización. Consultas a cotizaciones deberían usar montos/fechas mínimos requeridos; preferentemente ninguna información financiera personal.

## 8. Renderizado y despliegue

- Next.js con App Router y exportación estática para el MVP.
- Landing/documentación prerenderizadas.
- Workspace analítico en Client Components y Workers.
- Evitar acceder a File API, OPFS, IndexedDB o WebAssembly en SSR/build.
- Para navegación a proyectos locales, usar rutas estáticas y parámetros de consulta/estado; no asumir renderización dinámica de IDs de proyecto mediante exportación estática.
- Autenticación y Route Handlers requerirán migrar a despliegue Next.js con capacidad servidor, conservando landing estática donde convenga.
- Revisar COOP/COEP/CSP y dependencias de recursos remotos antes de optar por memoria compartida o Workers multihilo.

## 9. Calidad, límites y responsabilidades

- **Dominio:** unit tests sin Next.js, Worker o base real.
- **Aplicación:** tests de casos de uso con puertos falsos.
- **Infraestructura:** contract/integration tests de adaptadores y motores.
- **Numeral:** pruebas estadística/DTW/contabilidad contra referencias independientes y fixtures.
- **UI:** Playwright E2E de tareas completas, accesibilidad y responsividad.
- **Seguridad:** archivos malformados, XML/ZIP, CSV formula injection, HTML inseguro, composición SQL.
- **Rendimiento:** comparar 1k×10, 10k×20, 100k×30, 100k×100; cargas mayores según navegador. Medir memoria, tiempos y degradación, no prometer 100k universalmente.

## 10. Reglas de colaboración con agentes

1. Leer README, roadmap y este documento antes de proponer cambios.
2. Respetar la fase activa y sus criterios de aceptación.
3. Evitar nuevas abstracciones no justificadas; no generar carpetas vacías.
4. No importar infraestructura en dominio.
5. Mantener APIs públicas de módulos estables y evitar imports internos entre módulos.
6. Ejecutar pruebas correspondientes e informar resultados reales.
7. Actualizar ADR/documentación al cambiar arquitectura.
8. No introducir autenticación o nube antes de aprobar expresamente esa línea.
9. Evitar los valores de rendimiento inventados y los resultados estadísticos sin validación.

## 11. Decisiones por validar en fase 0

- Viabilidad real Next.js export estática + DuckDB-Wasm + Pyodide + Rust/Wasm.
- Mecanismo óptimo de intercambio entre Worker/runtimes.
- Compatibilidad XLSX y manejo de archivos grandes.
- Política de Workers y mecanismos de cancelación.
- OPFS: límites, persistencia y recuperación.
- Tamaño y entrega de assets WASM/Python en hosting estático.
- Seguridad de origen compartido, CORS y aislamiento si se requiere multihilo.

**Principio rector:** arquitectura visible por funcionalidades, dominio independiente, casos de uso comprobables y adaptadores sustituibles, sin sacrificar la simplicidad del producto inicial.

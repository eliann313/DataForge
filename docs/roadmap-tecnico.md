# DataForge — Documento maestro de producto, arquitectura y roadmap técnico

> **Versión:** 1.0 — 10 de octubre de 2026  
> **Repositorio:** [eliann313/DataForge](https://github.com/eliann313/DataForge) · Rama principal: **main**  
> **Estado al redactar:** planificación y documentación; todavía sin código de aplicación ni benchmarks concluyentes.  
> **Fase activa:** **0A — Fundamento tabular**.  
> **Carácter:** documento de transferencia de contexto para colaboradores y agentes de IA, **no una orden de implementar todas las fases**.

Este documento consolida la visión, el MVP, la arquitectura, el modelo de datos, las decisiones, el roadmap completo y las reglas de ejecución. Es una **fotografía de planificación**: antes de modificar el proyecto se debe inspeccionar el estado real del repositorio. En caso de divergencia, las implementaciones verificadas, pruebas y ADR aceptados tienen prioridad; el alcance inmediato se controla en [MVP.md](./MVP.md), el detalle vivo de fases en [roadmap.md](./roadmap.md) y las reglas para agentes en [AGENTS.md](../AGENTS.md).

---

## 1. Resumen ejecutivo

**DataForge** será una plataforma web de análisis, preparación y visualización de datos orientada al autoservicio, en español y con procesamiento **local-first**. Permitirá importar archivos, explorar su contenido, identificar errores, limpiar y combinar datos, calcular estadísticas, crear gráficos y producir informes, sin exigir conocimiento avanzado de programación ni obligar a subir archivos a un backend analítico.

La plataforma combinará la facilidad de una herramienta visual con capacidades técnicas típicas de SQL, Python y motores científicos, manteniendo complejidad progresiva para usuarios principiantes y avanzados.

**Objetivos:**

- **Accesibilidad:** importar y analizar datos o registrar finanzas sin programar.
- **Privacidad:** procesar los datos en el navegador por defecto; compartirlos externamente solo con acciones y consentimiento explícitos.
- **Gratuidad:** perseguir costo de infraestructura de procesamiento cercano a cero, sujeto a límites reales de hosting, almacenamiento y proveedores.
- **Rigor:** cálculos correctos, reproducibles, metodologías y fuentes visibles.
- **UX:** una interfaz profesional, accesible y responsive, con español neutro y formato regional es-AR inicial.
- **Extensibilidad:** reutilizar el núcleo para finanzas, ventas, encuestas, ciencia de datos y futuras integraciones.
- **Mantenibilidad:** módulos por funcionalidad, reglas de dominio desacopladas y adaptadores intercambiables.
- **Entrega progresiva:** demostrar utilidad en R1 antes de invertir en funcionalidades científicas, cloud o IA.

**Fuera de intención:** replicar Power BI, construir un ERP/WMS, operar un SaaS comercial completo, introducir procesamiento distribuido o convertir la IA en fuente de verdad numérica.

### Usuarios objetivo

1. Personas que analizan Excel/CSV.
2. Estudiantes, investigadores y analistas.
3. Usuarios que registran finanzas personales.
4. Pequeños negocios que analizan ventas y operaciones.
5. Personas que estudian encuestas.
6. Desarrolladores que prefieren SQL o herramientas estadísticas.

**Cuña de producto inicial:** análisis privado, local y en español de archivos tabulares, más un caso práctico temprano de finanzas personales.

---

## 2. Alcance funcional de la visión completa

### 2.1 Importación y Data Explorer

Formatos previstos: **CSV, XLSX, JSON tabular y Parquet**. Importación mediante selección y drag-and-drop; configuración de hojas, encabezados, delimitadores, codificación, columnas y tipos; vista previa virtualizada; filtros y orden; esquema físico y roles semánticos; perfilado de nulos, cardinalidad, frecuencias, rangos, tipos inválidos y duplicados potenciales.

Para XLSX **no está validado** el soporte directo de lectura desde DuckDB-Wasm. Se probarán lectura nativa y parser JavaScript en Worker.

### 2.2 Data Cleaning / Data Preparation

Transformaciones previstas:

- Deduplicación exacta o por claves configuradas.
- Tratamiento de nulos: conservar, filtrar o imputar según tipo y objetivo.
- Renombrado, selección y exclusión de columnas.
- Normalización de formatos, fechas, textos y categorías.
- Corrección de tipos y columnas calculadas.
- Filtros, orden, agregaciones.
- JOIN, UNION y APPEND con validación de cardinalidad.
- Pipelines ordenados, editables, reproducibles y trazables.
- Comparación de estadísticas antes/después y exportación del resultado.

**Nunca limpiar destructivamente el archivo original.** Detectar un problema no autoriza eliminar datos silenciosamente. Dos operaciones comerciales similares pueden ser legítimas; un valor faltante puede ser significativo; un outlier no es automáticamente un error.

El usuario selecciona las reglas, ve sus efectos y confirma. Una transformación crea una **versión derivada** con procedencia. No toda versión necesita una copia física completa: se decidirá materialización según persistencia y rendimiento.

### 2.3 Análisis estadístico

**Descriptivo:** registros, sumas, media, mediana, moda, rango, mínimos/máximos, varianza, desviación estándar, percentiles, cuartiles, IQR, frecuencias, distribuciones, agrupaciones y correlaciones justificadas.

**Avanzado (posterior):** intervalos de confianza, pruebas de hipótesis, comparaciones, regresiones, diagnósticos, inferencia, modelos temporales y medidas de error.

Los resultados deben exponer tamaño muestral, datos faltantes y supuestos cuando sea pertinente. **Correlación no implica causalidad.** No promediar identificadores o campos monetarios entre monedas distintas.

### 2.4 Visualizaciones

Apache ECharts para barras, líneas, sectores cuando correspondan, histogramas, dispersión, boxplots, heatmaps, series temporales, comparaciones y tablas resumen. Configuración de métricas, ejes, filtros y agregaciones.

Generar agregados antes de graficar; no intentar renderizar millones de puntos indiscriminadamente. Sugerir visualizaciones por **rol semántico**, además del tipo físico.

### 2.5 Informes y exportación

Report Builder con resumen ejecutivo, procedencia, calidad, métricas, gráficos, resultados, observaciones, conclusiones propias, metodología y limitaciones. Exportación prevista: HTML, imprimir/guardar en PDF, imágenes de gráficos, **CSV/Parquet procesados** y proyectos portables con contenido opcional.

Todo resultado debe referenciar la **versión concreta** de dataset y sus parámetros.

### 2.6 Plantillas

| Plantilla | Capacidades |
|---|---|
| **Análisis libre** | Dataset arbitrario, SQL, exploración, gráficos e informes |
| **Finanzas personales** | Ingresos, gastos, cuentas, categorías, presupuestos, transferencias, monedas e inflación |
| **Ventas y negocios** | Facturación, productos, descuentos, devoluciones, tendencias y márgenes si existen costos |
| **Encuestas e investigación** | Respuestas únicas/múltiples, Likert, segmentos, tamaños muestrales e informes |

**No son aplicaciones aisladas:** son configuraciones, mapeos, reglas y métricas sobre motores y componentes comunes.

---

## 3. MVP — R1

El **MVP público** es una aplicación en español, sin registro obligatorio, útil para analizar archivos reales y registrar finanzas básicas. Se obtiene completando **0A + fases 1, 2, 3 y 3B**. Los experimentos 0B y 0C no lo bloquean.

### Incluye

**Análisis general:**

1. Importar **CSV y XLSX** y mostrar tabla virtualizada/paginada.
2. Registrar el dataset en DuckDB-Wasm, alojado en Web Worker.
3. Ejecutar consultas SQL reales.
4. Mostrar esquema, tipos, nulos, duplicados potenciales, rangos y calidad básica.
5. Calcular descriptivos y generar gráficos verificados.
6. Ofrecer proyectos locales y datasets de demostración.

**Finanzas Lite:**

- Registrar, editar y eliminar ingresos/gastos.
- Fecha, descripción, importe, moneda ARS/USD, categoría y notas.
- Guardar localmente y persistir tras recargar.
- Resumen mensual, saldo por período, gráficos por categorías y evolución.
- **Separar ARS y USD, sin conversión ni suma implícitas**.
- Usar decimal exacto o unidades monetarias menores y redondeo explícito; comparar totales con fixtures.

### Excluye

Limpieza configurable completa, pipelines, uniones de datasets, informes exportables completos, descarga de versiones transformadas, cuentas, transferencias/tarjetas/reintegros, cotizaciones, presupuestos, recurrencias, IPC, plantillas de ventas/encuestas, IA, Pyodide/Rust como funciones de producto y API Connect.

### Criterio de éxito de R1

Una persona puede importar CSV/XLSX, obtener estadísticas y un gráfico correcto **sin cuenta**. Otra puede registrar movimientos, cerrar/recargar y recuperar su resumen. Hay demo pública, tests y mediciones honestas de capacidad.

**Distinción importante:** R1 **detecta** nulos y duplicados; R2 permite **limpiarlos, versionarlos y descargar los datos procesados**.

---

## 4. Arquitectura de software

**Estilo:** monolito modular **client-side**, Screaming Architecture / feature-first, con puertos/adaptadores y arquitectura hexagonal **pragmática**.

### 4.1 Reglas de dependencia

- El **dominio** contiene invariantes, entidades y reglas puras; no importa React, Next.js, DuckDB, Pyodide, IndexedDB, OPFS ni proveedores cloud.
- **Aplicación** implementa casos de uso y define puertos donde se necesita sustituir o simular una dependencia.
- **Infraestructura** implementa puertos de motores, persistencia, importación y proveedores.
- **Presentación** contiene React, componentes, hooks y formularios.
- Cada módulo expone una API pública explícita, por ejemplo un archivo índice; evitar importar detalles internos de otros módulos.
- Next.js App Router, si se adopta, compone páginas y navegación, **no aloja reglas de negocio**.
- Crear las capas solo donde agreguen valor; no generar estructuras vacías ni abstracciones especulativas.
- No construir microservicios ni una arquitectura de procesamiento distribuido.

### 4.2 Módulos y profundidad

| Módulo | Diseño esperado |
|---|---|
| **finance** | Reglas fuertes, entidades y casos de uso; hexagonal |
| **projects** | Casos de uso y repositorios |
| **datasets** | Fuentes, versiones, esquemas, semántica, procedencia y adaptadores DuckDB |
| **analysis** | Servicios de consulta, estadísticas y resultados tipados |
| **pipelines** | Reglas, pasos, ejecución, versiones y adaptadores |
| **reports** | Snapshots, composición, exportadores |
| **sales / surveys** | Plantillas y mapeos; reutilización del núcleo, sin cinco capas obligatorias |
| **forecasting / time-series** | Análisis especializado, modelos/DTW según evidencia |
| **optimization** | Problemas, variables, objetivos, restricciones |
| **ai-assistant / auth / integrations** | Solo en extensiones futuras aprobadas |

### 4.3 Estructura objetivo, no scaffolding obligatorio

~~~text
DataForge/
├── README.md
├── AGENTS.md
├── public/
│   └── demo-data/
├── src/
│   ├── app/                    # si se confirma Next.js
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
├── rust/
├── tests/
├── e2e/
├── benchmarks/
├── docs/
└── .github/workflows/
~~~

El árbol describe el destino eventual. **No crearlo entero al iniciar la fase 0A.**

### 4.4 Ejemplo: movimiento financiero

React valida la estructura del formulario; un caso de uso de aplicación valida invariantes financieras; un repositorio definido como puerto permite guardar en IndexedDB. Si se aprueba almacenamiento conectado, el adaptador cambia sin trasladar reglas monetarias al proveedor.

Nunca calcular contabilidad financiera con sumas de flotantes binarios sin una política formal. Una transferencia propia no constituye gasto; el pago de una tarjeta no debe duplicar un consumo registrado.

---

## 5. Stack tecnológico y responsabilidades

| Capa | Tecnología prevista | Estado |
|---|---|---|
| Web | **Next.js + React + TS strict**; **Vite + React** como alternativa | Candidato, decisión ADR-0001 pendiente |
| UI | Tailwind CSS, shadcn/ui, Lucide React | Previsto |
| Tablas | TanStack Table + TanStack Virtual | Previsto |
| Gráficos | Apache ECharts | Previsto |
| Validación/estado | Zod; Zustand cuando aporte valor | Previsto |
| Canvas de pipelines | React Flow | Posterior |
| Motor tabular | **DuckDB-Wasm** en Worker | Prioridad 0A |
| Python científico | **Pyodide**, Pandas, NumPy, SciPy, statsmodels, scikit-learn compatibles | Investigar 0B |
| DataFrames alternativos | **Polars** | Candidato experimental, no obligatorio |
| Algoritmos | Rust/Wasm + wasm-bindgen | Investigar 0C |
| Persistencia local | IndexedDB y OPFS | Validar |
| Tests | Vitest, Playwright, tests numéricos Python/Rust, GitHub Actions | Por fase |
| Despliegue | Vercel; exportación estática inicial si se confirma | Validar 0A |
| Nube | Auth, Neon PostgreSQL, objetos privados | Opcional, fuera del MVP |

**No instalar toda la lista en una sola fase.**

---

## 6. Motores analíticos y comunicación

### 6.1 DuckDB-Wasm — núcleo tabular

Dueño de los datasets tabulares activos: SQL, importación compatible, profiling, filtrado, joins, agregaciones y ELT/ETL. Se ejecuta en Worker, con resultados restringidos a columnas y filas necesarias. Validar identificadores, separar valores de SQL y limitar operaciones costosas.

### 6.2 Pyodide — científico

Worker diferido; no inicializar durante la carga del shell. Ejecutar pruebas estadísticas y modelos que justifican Python. **Pandas** es la vía prevista de compatibilidad con el ecosistema científico; **Polars** se evaluará solo si su port a Pyodide demuestra valor real en compatibilidad, tamaño, memoria y rendimiento. DuckDB dentro de Pyodide permanece como alternativa de arquitectura a medir, no decisión.

### 6.3 Rust/Wasm — especializado

Investigar distancia euclidiana, **DTW exacto**, ventana Sakoe-Chiba, memoria reducida y eventualmente LB_Keogh. Comparar contra **TypeScript** con resultados de referencia. Medir ejecución **más carga, inicialización y transferencia**. Rust no es obligatorio si no aporta ventaja medible ni un caso de uso valioso.

### 6.4 Analytics Orchestrator

Coordinar Worker lifecycle, operaciones y versiones, progreso, errores, cancelación cuando sea viable, límites, colas y recuperación. Contratos de operaciones neutrales a implementación: identificador, dataset/versión, parámetros y resultados tipados.

- Metadatos: JSON tipado.
- Tablas: Arrow IPC u otro formato tipado benchmarkeado.
- Series: Typed Arrays / buffers transferibles cuando resulte beneficioso.
- **No asumir zero-copy** entre memorias WASM independientes.
- Evitar mantener tres copias completas del dataset simultáneamente.

---

## 7. Modelo de datos y versionado

### 7.1 Entidades propuestas

**Generales:** Folder, Project, DatasetSource, DatasetVersion, DatasetSchema, SemanticColumn, PipelineDefinition, PipelineExecution, AnalysisSnapshot, Visualization, Report, DataLineage, UserPreferences.

**Finanzas:** FinancialAccount, FinancialTransaction, FinancialCategory, Budget, RecurrenceRule, ExchangeRateSnapshot; materializar solo las necesarias en cada fase.

**Especializadas:** SalesMapping, SurveyQuestionDefinition y otras configuraciones cuando exista caso de uso real.

### 7.2 Contratos y responsabilidades

- **DatasetSource:** origen inmutable, formato, tamaño, metadatos y procedencia.
- **DatasetVersion:** transformación o combinación con referencia a origen/padre, esquema y reglas; no obliga a copiar físicamente siempre.
- **SemanticColumn:** tipo físico y rol semántico editable.
- **PipelineDefinition:** pasos tipados, ordenados y parametrizados.
- **PipelineExecution:** ejecución, estado, métricas, errores y linaje.
- **AnalysisSnapshot:** versión de datos, filtros, parámetros, métricas y evidencia.
- **Report:** secciones, datos, figuras, limitaciones y procedencia.

### 7.3 Persistencia

**IndexedDB** para metadatos, preferencias, proyectos y datos estructurados adecuados; **OPFS** para archivos/datasets grandes según compatibilidad y mediciones. Planificar respaldo mediante exportación/importación de proyectos.

La persistencia del navegador puede perderse por limpieza, evicción, cuotas o pérdida de dispositivo. No prometer almacenamiento perpetuo. La arquitectura debe manejar escrituras fallidas, estados parciales, migraciones y recuperación.

### 7.4 Flujo de versiones

Archivo original → DatasetSource + V0 → profiling → reglas elegidas → ejecución de pipeline → V1 → análisis sobre V0 o V1 → comparación → exportación de V1 en CSV/Parquet.

Este flujo completo pertenece a **R2**; el MVP cubre importación, profiling y visualización de la fuente.

---

## 8. UI/UX y mockups

**Diseño aprobado:** sidebar oscura, área central clara, acento azul/violeta, tarjetas de KPI, tablas densas pero legibles, gráficos, barra superior de contexto e inspector derecho. UX desktop-first **sin excluir** móviles/tablets; inspector transformable en drawer.

**Navegación documentada:**

| Sección | Alcance |
|---|---|
| Inicio | Proyectos, carpetas, demos y plantillas |
| Datos | Importar, explorar, esquema, calidad |
| Análisis | Métricas, estadística, gráficos |
| Transformaciones | Cleaning, uniones y pipelines |
| Laboratorio | SQL, Python, forecasting, DTW, optimización según fase |
| Informes | Builder, vista previa, exportaciones |

**Español neutro** en textos; configuración inicial es-AR para números/fechas, ARS/USD según campo. La UI debe presentar estados de vacío, carga, progreso, errores y recuperación, con navegación accesible de teclado, contraste y alternativa tabular a cifras gráficas.

**Precedencia:** los PNG originales definen **dirección estética**, no alcance ni navegación definitiva. Las apariciones de Prophet, Machine Learning, XML, mapas, etc., no implican funcionalidades prometidas.

Referencias: [guía de diseño](./design/README.md) y [tres PNG originales](./design/mockups/README.md).

---

## 9. Roadmap técnico detallado

Cada fase exige pruebas y una demostración; las fechas de calendario no están comprometidas.

### Fase 0A — Fundamento tabular (inmediata)

**Objetivo:** validar framework, DuckDB-Wasm, Workers, formatos y deploy estático.

**Alcance:**

1. Inicializar React + TypeScript estricto, candidato Next.js.
2. Integrar DuckDB-Wasm en Worker y protocolo tipado.
3. Importar CSV, registrar dataset y ejecutar SQL.
4. Mostrar vista previa correcta sin bloquear interfaz.
5. Investigar XLSX: DuckDB directo **si realmente funciona**; alternativa parser JS en Worker.
6. Medir latencia, memoria, bundles, arranque y compatibilidad.
7. Confirmar exportación estática y despliegue Vercel.
8. Evaluar Vite solo si surgen fricciones significativas o el esfuerzo comparativo es reducido.
9. Configurar pruebas/CI iniciales, registrar resultados en ADR-0001/0002.

**DoD:** archivo real importado/consultado/visto, resultados correctos contra fixture, UI responsiva, build y smoke test, medidas documentadas. **No comenzar IA, cuentas, finanzas completas ni Rust productivo.**

### Fase 0B — Python científico (spike independiente)

**Objetivo:** comprobar Pyodide sin comprometer R1.

**Alcance:** Worker diferido, cálculo científico validado, transferir subconjuntos DuckDB→Python, medir memoria/copias, arranque frío/caliente y paquetes; evaluar Pandas/Polars y alternativa DuckDB en Pyodide si aporta valor.

**DoD:** cálculo correcto y evidencia de tiempos y memoria; Pyodide no carga al inicio general.

### Fase 0C — Rust/WebAssembly (spike independiente)

**Objetivo:** decidir si Rust justifica su incorporación a algoritmos especializados.

**Alcance:** wasm-bindgen, Worker, DTW con comparación TypeScript, buffers y benchmark total (carga + transferencias + ejecución), caso de uso documentado.

**DoD:** resultados dentro de tolerancia y decisión basada en evidencia: adoptar, conservar opcional o descartar para el cálculo.

### Fase 1 — Fundamentos del producto

Landing, dos CTAs («Importar mis datos» / «Probar un ejemplo»), shell, sidebar, inspector, tokens, componentes accesibles, carpetas y proyectos locales (crear/renombrar/mover/eliminar), persistencia de metadatos y datasets demo.

**DoD:** navegación coherente, proyectos recuperables al recargar, funcionamiento sin cuenta.

### Fase 2 — Importación y Data Explorer

CSV/XLSX/JSON tabular/Parquet, hojas y configuración de importación, inferencia/corrección de tipos, vista previa, tabla virtualizada, schema, roles semánticos y profiling de nulos, duplicados potenciales, cardinalidad y rangos. Seguridad frente a archivos corruptos.

**DoD:** cada formato declarado compatible se importa y explora correctamente; errores no corrompen el proyecto; no renderizar toda la tabla.

### Fase 3 — Estadística descriptiva y Visual Analytics

Media/mediana/moda, dispersión, cuartiles/percentiles, frecuencias, correlaciones justificadas, filtros, agrupaciones, gráficos ECharts, sugerencias semánticas, hallazgos por reglas vinculadas a evidencia y exportación sencilla de figuras.

**DoD:** cálculos coinciden con fixtures; gráficos muestran agregados correctos; sin inferencias causales injustificadas.

### Fase 3B — Finanzas Lite → **R1 / MVP**

Registro manual de ingresos/gastos, categorías, ARS/USD, edición y eliminación, resumen mensual, saldo por período y gráficos básicos; persistencia local con precisión monetaria.

**Fuera:** cuentas bancarias, transferencias, tarjetas, presupuestos, cotizaciones, recurrencias, importación bancaria, IPC.

**DoD:** usuario registra sin CSV, recupera tras recargar; totales exactos por moneda sin conversión/suma cruzada. **Publicar primera versión útil.**

### Fase 4 — Limpieza, pipelines y múltiples datasets

Deduplicación, nulos, normalización, filtros, tipos, expresiones, agregaciones, pipelines declarativos, versiones, preview antes/después, repetición/deshacer mediante versiones, JOIN con cardinalidad confirmada, UNION/APPEND.

**DoD:** originales intactos, pipeline repetible, linaje recuperable, errores sin estado parcial, sin multiplicación involuntaria de importes.

### Fase 4B — Conectores REST de lectura (opcional)

Importar datos JSON/CSV desde APIs, con paginación, mapeo y procedencia. Browser CORS si no hay secretos; conectores backend restringidos solo si se aprueban. Nunca proxy arbitrario expuesto.

**DoD:** importación de API demo verificada y controles de acceso, formatos y límites.

### Fase 5 — Data Insights, Report Builder y portabilidad → **R2**

Builder de informes con fuentes, calidad, métricas, gráficos, observaciones, conclusiones, metodología y límites; snapshots, exportación HTML/PDF y CSV/Parquet procesados; proyectos portables y restauración.

**DoD:** se puede limpiar un archivo, analizar su versión transformada, exportar datos limpios y construir informe reproducible; sanitización de HTML/texto y respaldo validado.

### Fase 5B-A — IA local (opcional)

Context Builder mínimo, hallazgos deterministas y exploración Chrome Built-in AI con detección real de compatibilidad, sin fallback remoto silencioso. Evidencia de métricas e informes editables.

**DoD:** sin tráfico de contenido a LLM remoto y sin romper la app si no existe soporte.

### Fase 5B-B — IA remota (opcional)

Vercel AI SDK/Gateway, chat con streaming, informes asistidos estructurados, consentimiento explícito y vista previa del contexto, Zod/validación de referencias, cuotas, costos y kill switch. BYOK persistente solo con diseño seguro y cuentas cuando corresponda.

**DoD:** no se envía información sin consentimiento, no se exponen secretos y las respuestas no pueden sobrescribir resultados calculados.

### Fase 5B-C — Text-to-SQL controlado (opcional)

IA propone SQL; usuario revisa y autoriza; ejecución restringida a lectura, tablas autorizadas y recursos limitados. No basta con permitir sentencias que comiencen con SELECT.

**DoD:** consultas asistidas sin mutaciones ni acceso a recursos externos.

### Fase 6 — Finanzas Personales completas

Extender Lite con cuentas, transferencias, reintegros, presupuestos, importaciones CSV/XLSX y mapeo financiero, detección de duplicados, dashboard e informes.

**DoD:** una transferencia propia no es gasto; pagos de tarjetas no duplican consumos; totales exactos.

### Fase 7 — Finanzas avanzadas → **R3**

Recurrencias, cuotas, presupuestos por categoría, gastos compartidos, comparaciones, tasas ARS/USD oficial/MEP/CCL/manual, fuente/fecha y snapshot, degradación sin API, ajuste por inflación mediante **IPC** con fuente y período base.

**DoD:** conversiones reproducibles, sin promediar tipos de cambio de distintos mercados y sin confundir montos nominales/ajustados.

### Fase 7B — Ventas y Encuestas → **R3B**

**Ventas:** mapeos, facturación, productos, categorías, descuentos, devoluciones, impuestos, tendencias e informes; márgenes solo con costos fiables; controlar doble conteo de JOIN.

**Encuestas:** respuestas únicas/múltiples, Likert, segmentos, frecuencias, tablas de contingencia, tamaño muestral y faltantes; evitar tratar respuestas múltiples como únicas.

**DoD:** reutilización del motor común, fixtures por plantilla, conclusiones con denominadores correctos.

### Fase 8 — Estadística científica y forecasting

Pyodide productivo bajo demanda, SciPy/Pandas/NumPy/statsmodels compatibles, intervalos, pruebas, regresiones, diagnósticos, baselines ingenuos/estacionales, backtesting temporal, MAE/RMSE e incertidumbre. No habilitar modelos por el mero hecho de figurar en imágenes.

**DoD:** tests científicos independientes, supuestos claros, carga de Python solo cuando corresponde.

### Fase 9 — Rust/Wasm y Time-Series Studio → **R4**

DTW exacto/ventana, distancias, normalización, validación de nulos/frecuencia/longitud, comparaciones, alineamientos y matrices con límites. Depende de evidencia del spike 0C.

**DoD:** corrección, rendimiento completo medido, límites comprensibles.

### Fase 10 — Optimización y modelado (opcional)

Asignación de recursos, mezcla de producción, presupuestos, programación lineal/entera mixta si es viable, variables, restricciones y diagnósticos.

**DoD:** distinguir resultados óptimos, factibles, aproximados y fallidos; no bloquea R5.

### Fase 11 — Hardening y portfolio → **R5**

Accesibilidad, responsive, navegación por teclado, validación de Workers, tests unitarios/contratos/integración/E2E, seguridad de importación y exportación, rendimiento por navegador, lazy loading, persistencia y respaldos, capturas reales, demo pública y documentación con estado verificado.

**DoD:** producto estable, demostrable, auditado y documentado; R5 **no** exige nube, IA remota ni todos los experimentos.

---

## 10. Extensiones Cloud C0–C3 (independientes y fuera de R1–R5)

**C0 — Autenticación opcional:** email/contraseña, verificación, recuperación y eliminación; evaluar Neon Auth/Better Auth + correo transaccional gestionado, sin SMTP propio. Política de cuentas mayores de 18 años propuesta, pendiente de revisión legal.

**C1 — Sincronización ligera:** Neon PostgreSQL para cuentas, carpetas, metadatos, preferencias e informes/pipelines; datasets originales locales por defecto. Otro dispositivo puede ver metadatos pero no ejecutar análisis si no posee los archivos.

**C2 — Sincronización privada de archivos:** almacenamiento de objetos separado de PostgreSQL, subidas explícitas y privadas, cuotas, autorización, descarga y eliminación.

**C3 — DataForge Connect entrante:** endpoint autenticado por fuente/proyecto para que otros sistemas (p. ej., GridHub WMS) envíen eventos o snapshots aunque el navegador esté cerrado. Bandeja persistente, validación, idempotencia, scopes, rotación/revocación de claves, límites de tamaño/retención y almacenamiento privado para archivos grandes. Procesamiento posterior **local** al aceptar la importación.

**API keys de ingesta:** tokens aleatorios de alta entropía, mostrados una vez y verificados mediante hash/digest; no guardar sus valores recuperables. **BYOK de IA** es otra categoría y requiere diseño diferente.

Las capacidades de servidor implican revisar la exportación estática, seguridad, costos y cumplimiento. No introducirlas antes de una decisión explícita.

---

## 11. Asistente de IA: principios de confianza

**Los motores calculan; la IA interpreta.**

Un Context Builder construirá información mínima con identificadores de métricas, valores, unidades, fechas, parámetros, tamaños muestrales y evidencias. La respuesta debe distinguir dato verificado, interpretación, hipótesis, sugerencia y limitación.

Modos futuros: reglas deterministas locales; Chrome Built-in AI cuando sea compatible; AI Gateway remoto; BYOK; text-to-SQL controlado.

- **Prohibido** inventar cifras, modificar datasets mediante el chat o ejecutar código/SQL arbitrario.
- Sin compartir datasets completos por defecto.
- Sin pasar de IA local a remota sin consentimiento.
- Mostrar el contexto que se enviaría a un tercero.
- Validar referencias a metricId / snapshots.
- Usuario edita y confirma las conclusiones para informes.
- No usar endpoints anónimos de gasto ilimitado.
- Claves globales solo servidor, nunca variables NEXT_PUBLIC ni logs.
- Vault BYOK persistente diferido a una fase con cuentas; cifrado AES-256-GCM con IV único, rotación y clave maestra privada cuando se apruebe.
- Proteger contra prompt injection en archivos, etiquetas y contenido importado.

Documentación específica: [ai-assistant.md](./ai-assistant.md).

---

## 12. Seguridad, privacidad y cumplimiento

### Archivos hostiles

Tratar todas las entradas como no confiables. Probar CSV formula injection, ZIP/XML malformado, expansión de XLSX, datos corruptos, encabezados hostiles, HTML inseguro, tamaños desmesurados y valores inválidos. Limitar memoria, tiempo y descompresión; informar fallos claros.

### SQL

Parametrizar valores, escapar y validar identificadores, restringir tablas/funciones y recursos. Evitar que consultas asistidas accedan a redes o archivos no autorizados.

### Almacenamiento

La privacidad local no implica offline total ni conservación garantizada. Se necesitan mensajes claros sobre cuotas del navegador, copias de seguridad, limpieza de datos y funcionamiento de integraciones remotas.

### Finanzas

Precisión monetaria exacta; conservar divisa de origen y reglas de conversión, snapshots históricos, evitar transferencias/gastos duplicados y no emitir asesoramiento financiero automatizado.

### Cloud y legal

Autorización por propietario, rate limiting, cookies/recuperación seguras, eliminación y derechos del usuario cuando existan cuentas. Los borradores de [Términos](./legal/terms-of-use.md), [Privacidad](./legal/privacy-policy.md) y [Avisos](./legal/ai-financial-disclaimer.md) **no están aprobados para publicación**: requieren entidad responsable, contacto, jurisdicción, proveedores reales, retención y revisión jurídica.

---

## 13. Testing, benchmarks y Definition of Done

### Niveles de test

- **Dominio:** unit tests puros de invariantes, cálculos financieros y transformación.
- **Aplicación:** casos de uso con adaptadores falsos.
- **Infraestructura:** contratos/integración de DuckDB, importadores, Workers, IndexedDB y OPFS.
- **Numérico:** estadísticas, previsiones, DTW y moneda contra fixtures o implementaciones independientes.
- **UI/E2E:** Playwright para importar, analizar, crear proyectos, registrar finanzas, recargar, recuperar y exportar.
- **Seguridad:** archivos malformados, SQL, HTML y CSV exportado.
- **CI:** lint, tipado, tests, builds y artefactos reproducibles según fase.

### Benchmark — umbrales provisionales del ADR-0002

| Prueba | Hipótesis inicial, no garantía |
|---|---|
| CSV 10.000 × 20 | Importación + preview menor a 5 s |
| CSV 100.000 × 30 | Importación + preview menor a 20 s en equipo de referencia |
| 100.000 × 30 | Investigar si memoria incremental pico supera 1 GiB |
| UI | Sin bloqueos perceptibles durante tareas pesadas |
| Pyodide | Medir arranque frío/caliente y tras paquetes |
| Rust | Medir cálculo + transferencia + inicialización |
| Compatibilidad | Chromium y otro navegador de escritorio; móvil por separado |

Otros objetivos orientativos: archivos CSV/Parquet de 20 MB, XLSX de 10 MB y datasets del orden de 100.000 filas; ajustar a datos reales. Estrés posterior: matrices 1k×10, 10k×20, 100k×30, 100k×100 y escenarios mayores.

Registrar **hardware, sistema operativo, navegador y versión, versiones de librerías, tamaño real del archivo, al menos cinco ejecuciones, mediana, rango, memoria y errores**. No confundir virtualización de UI con ingesta incremental.

### Definition of Done por fase

1. Alcance y criterios de aceptación cumplidos.
2. Tests correspondientes ejecutados, resultados reales incluidos.
3. Build sin regresiones.
4. Cálculos verificados con referencias independientes.
5. Fuente original preservada.
6. Errores, cancelación y recuperación cubiertos según el caso.
7. Limitaciones y riesgos documentados.
8. README, roadmap y ADR actualizados con estado real.
9. Demostración reproducible.

---

## 14. ADR y decisiones pendientes

### ADR-0001 — Next.js frente a Vite

Next.js con exportación estática es **candidato principal**, no elección irrevocable. Vite + React es alternativa. Comparar integración Workers/WASM, assets, configuración, build, bundle, rutas locales, deploy y evolución futura.

La exportación estática Next.js no ofrece funciones dinámicas de servidor ni headers configurados mediante next.config; COOP/COEP podría configurarse en el hosting (p. ej., vercel.json), **solo si se demuestra necesario**. No activar aislamiento global sin evaluar efectos sobre recursos externos/auth.

Ver [ADR-0001](./adr/0001-framework-y-exportacion-estatica.md).

### ADR-0002 — Motores, formatos y límites

Validar importación XLSX, formato entre runtimes, Pyodide, Pandas/Polars, Rust/DTW, manejo de memoria y cancelación. Los criterios provisionales pueden corregirse antes de aceptar la decisión.

Ver [ADR-0002](./adr/0002-motores-analiticos-y-criterios-de-corte.md).

**Ambos ADR están propuestos** hasta existir resultados medidos. El stack no se cierra por preferencias de herramienta.

---

## 15. Tabla de releases

| Release | Fases | Resultado |
|---|---|---|
| **R0** | 0A, 0B, 0C | Viabilidad; **0B/0C no bloquean R1** |
| **R1 / MVP** | 1–3B sobre 0A | Importación, exploración, análisis, gráficos y Finanzas Lite |
| **R2** | 4–5 | Cleaning, pipelines, datasets múltiples, informes y exportación |
| **R3** | 6–7 | Finanzas completas y avanzadas |
| **R3B** | 7B | Ventas y encuestas |
| **R4** | 8–9 | Ciencia estadística y series temporales |
| **R5** | 11 | Hardening, pruebas, accesibilidad y portfolio |
| **Opcional** | 10 | Optimización y modelado |
| **Opcional** | 4B, 5B-A/B/C | REST/IA/text-to-SQL |
| **Opcional** | Cloud C0–C3 | Auth, sincronización y recepción externa |

No hay fechas de entrega comprometidas. Cada release debe entregar valor autónomo y medible.

---

## 16. Plan operativo inmediato: fase 0A

**Estado verificado al redactar:** documentos y mockups publicados, sin aplicación ni pruebas de motor. No declarar nada implementado hasta verificar código nuevo.

Orden sugerido de issues:

| Issue | Entregable |
|---|---|
| **0A.1** | Inicialización React/TS, framework candidato, lint/tests/CI inicial |
| **0A.2** | Worker DuckDB-Wasm, contrato tipado, lifecycle y errores |
| **0A.3** | Importar CSV, crear tabla, consulta SQL, vista previa, fixtures |
| **0A.4** | Probar XLSX directo y ruta parser JS/Worker; documentar elección |
| **0A.5** | Benchmark y compatibilidad con mediciones replicables |
| **0A.6** | Build/deploy Vercel, smoke tests, actualizar ADR-0001/0002 |

**No convertir el spike en la UI final ni agregar funcionalidades de fases posteriores.**

La **condición de cierre** es poder abrir una demo y comprobar que un archivo real se importa, consulta y muestra correctamente con la interfaz responsive, documentación de límites y build reproducible.

---

## 17. Reglas de trabajo para agentes

Leer primero:

1. [README](../README.md).
2. [MVP](./MVP.md).
3. [Roadmap vivo](./roadmap.md).
4. [Arquitectura](./architecture.md).
5. [ADR relevantes](./adr/README.md).
6. [AGENTS.md](../AGENTS.md).
7. [Diseño y mockups](./design/README.md) cuando la tarea es visual.
8. **El código de la rama activa y sus pruebas** para conocer lo que existe de verdad.

### Durante la tarea

- Respetar fase, issue y límites.
- No ampliar alcance sin aprobación.
- No asumir que aparece en el mockup = está requerido.
- Mantener módulos independientes y contratos tipados.
- No instalar tecnologías adelantadas.
- No generar carpetas ni abstracciones vacías.
- Proteger fuentes originales, cálculo y privacidad.
- Registrar fallos, pruebas y mediciones sin inventar resultados.
- Actualizar documentación/ADR ante decisiones.

### Al finalizar

Informar objetivo, archivos cambiados, decisiones, pruebas realmente ejecutadas, resultados, errores, riesgos, documentación actualizada y próximos pasos. No declarar una fase terminada por una demo visual.

### Precedencia

Implementación + tests comprobados → ADR aceptados → MVP/fase activa → roadmap/arquitectura → guías específicas → mockups. Este documento maestro es **contexto de transferencia**, no reemplaza verificación del repositorio.

---

## 18. Riesgos y mitigaciones principales

| Riesgo | Mitigación |
|---|---|
| XLSX no soportado directamente en DuckDB-Wasm | Parser JS en Worker, medido y probado |
| Memoria excesiva / UI congelada | Workers, límites, agregación, lazy loading, benchmarks |
| Pyodide demasiado pesado | Carga explícita, subdatasets, opción de no incorporarlo |
| Copias entre motores WASM | Arrow/Typed Arrays y mediciones; no asumir zero-copy |
| Rust sin ventaja real | Comparar con TypeScript; no hacerlo obligatorio |
| Archivos peligrosos | Validación, cuotas, descompresión limitada, fixtures hostiles |
| Datos locales eliminados | Exportación/importación de respaldo y advertencias |
| Doble conteo financiero | Reglas del dominio + tests y cardinalidad de JOIN |
| IA produce conclusiones falsas | Citas a metricId y separación hecho/hipótesis |
| APIs remotas abusadas | Cuotas, auth, límites y kill switch |
| Alcance excesivo | Fase activa y releases; extensiones no bloqueantes |
| Falsas funcionalidades en mockups | Documentación define alcance; PNG define estética |
| Costos de terceros/free tiers | Verificación de cuotas actuales antes de activar nube |

---

## 19. Alcance negativo

DataForge **no** es un ERP, WMS, plataforma de colaboración multiusuario en tiempo real, servicio de cálculo distribuido, asesor financiero, LLM autónomo ni entorno de deep learning intensivo.

No implementar sincronización bancaria automática, backend científico, cuentas obligatorias, cuotas ilimitadas ni funcionalidades de SaaS comercial completo por inferencia.

El objetivo es hacer **análisis útiles, correctos y reproducibles con mínima dependencia de servidores**.

---

## 20. Documentos fuente y referencias

**Producto y ejecución:**

- [README](../README.md)
- [MVP operativo](./MVP.md)
- [Roadmap detallado](./roadmap.md)
- [Arquitectura](./architecture.md)
- [Reglas para agentes](../AGENTS.md)

**Decisiones:**

- [ADR-0001 — Framework/exportación estática](./adr/0001-framework-y-exportacion-estatica.md)
- [ADR-0002 — Motores, formatos y criterios](./adr/0002-motores-analiticos-y-criterios-de-corte.md)

**Extensiones:**

- [IA y chatbot](./ai-assistant.md)
- [Autenticación](./authentication.md)
- [DataForge Connect](./integrations.md)

**Diseño y cumplimiento:**

- [Guía UI](./design/README.md)
- [Mockups PNG originales](./design/mockups/README.md)
- [Términos — borrador](./legal/terms-of-use.md)
- [Privacidad — borrador](./legal/privacy-policy.md)
- [IA y finanzas — borrador](./legal/ai-financial-disclaimer.md)

---

## 21. Resultado esperado por hito

- **R1:** usuario importa CSV/Excel, explora datos, visualiza estadísticas/gráficos, registra finanzas básicas sin cuenta.
- **R2:** transforma/limpia y combina datasets, guarda pipelines, descarga archivos limpios y genera informes reproducibles.
- **R3/R3B:** cuenta con herramientas especializadas de finanzas, ventas y encuestas.
- **R4:** emplea estadística científica y series temporales cuando el rendimiento y la utilidad estén demostrados.
- **R5:** dispone de una aplicación consolidada, accesible, segura, probada y documentada como producto de portfolio.
- **Extensiones futuras:** IA, cuentas, sincronización e integraciones optativas, sin abandonar el núcleo local.

---

## 22. Principio rector

> **Primero construir una aplicación que resuelva correctamente problemas comunes de análisis de datos. Después aumentar su profundidad científica, especialización e integración.**

La complejidad tecnológica debe responder a necesidades medibles, no a la acumulación de frameworks o algoritmos. La siguiente decisión práctica es **completar fase 0A** y demostrar que el motor tabular funciona en un navegador real.

# DataForge — Roadmap maestro

> **Estado:** planificación / validación arquitectónica. Las funcionalidades descritas están **previstas**, no implementadas, salvo que el código y las pruebas del repositorio demuestren lo contrario.

**Objetivo:** construir una plataforma de análisis de datos autoservicio, en español, con procesamiento local en el navegador, proyectos persistentes, visualizaciones, pipelines reproducibles e instrumentos científicos especializados.  
**Alcance:** proyecto educativo y de portfolio; objetivo de infraestructura sin servicios pagos.  
**Arquitectura prevista:** Next.js + TypeScript como candidato principal (Vite + React como alternativa evaluada en el [ADR-0001](adr/0001-framework-y-exportacion-estatica.md)), arquitectura gritona por dominio con capas y puertos/adaptadores aplicados según la complejidad de cada módulo. DuckDB-Wasm, Pyodide y Rust/Wasm se validarán en la fase 0 ([ADR-0002](adr/0002-motores-analiticos-y-criterios-de-corte.md)) antes de adoptarse formalmente.  
**Prioridad de ejecución:** este roadmap conserva la visión completa del producto. Lo que se construye primero está acotado en [MVP.md](MVP.md).

## 1. Visión y alcance

DataForge permite a usuarios básicos y avanzados:

- Importar CSV, XLSX, JSON tabular y Parquet; gestionar varios datasets por proyecto.
- Explorar estructura, semántica, calidad, estadísticas y relaciones.
- Filtrar, limpiar y transformar datos mediante pipelines auditables.
- Crear gráficos, hallazgos explicables e informes exportables.
- Utilizar plantillas **Análisis libre**, **Finanzas personales**, **Ventas y negocios** y **Encuestas e investigación**.
- Acceder, por fases posteriores, a estadística científica, predicciones, series temporales, DTW y optimización matemática.
- Trabajar **sin cuenta** y con los archivos **locales por defecto**; cuentas y sincronización en la nube serán opcionales.

**Reglas de producto:** no replicar Power BI; no introducir infraestructura sin una necesidad demostrable; no generar conclusiones estadísticas engañosas; preservar versiones de las fuentes y la trazabilidad; cada fase debe entregar valor utilizable.

### UX y convenciones

- Solo español; navegación lateral, contenido central e inspector contextual.
- Acceso por **Importar mis datos** o **Probar un ejemplo**.
- Interfaz progresiva: **Análisis rápido** y **Espacio de trabajo avanzado**.
- Tema claro por defecto; tema oscuro posterior. Accesibilidad y diseño responsive.
- Monedas iniciales: USD y ARS; mostrar unidades originales y no convertir sin autorización.
- Plantillas reutilizan capacidades del núcleo: no duplican motores, tablas, gráficos ni exportación.

## 2. Stack objetivo (sujeto a comprobación)

| Capa | Tecnología | Responsabilidad |
|---|---|---|
| Aplicación | Next.js + React + TypeScript strict | Landing, workspace, navegación |
| UI | Tailwind CSS, shadcn/ui, Lucide React | Componentes y sistema visual |
| Tablas | TanStack Table + Virtual | Vista previa, filtros, virtualización |
| Validación/estado | Zod; Zustand cuando se necesite | Contratos, formularios, coordinación de UI |
| Gráficos | Apache ECharts | Visualización interactiva |
| Pipelines visuales | React Flow, en su fase | Nodos y conexiones |
| Datos tabulares | DuckDB-Wasm en Web Worker | SQL, profiling, ELT, combinaciones |
| Python científico | Pyodide bajo demanda | Pandas, NumPy, SciPy, modelos |
| Algoritmos | Rust/Wasm con wasm-bindgen | Distancias, DTW y algoritmos especializados |
| Datos locales | IndexedDB, OPFS | Configuraciones, proyectos y datasets |
| Despliegue | Exportación estática de Next.js + Vercel | Hosting inicial |
| Calidad | Vitest, Playwright, tests Python/Rust, GitHub Actions | Pruebas y CI |
| Opcional futuro | Auth + Neon PostgreSQL + objetos privados | Cuentas y sincronización |

El código de dominio no dependerá directamente de estos proveedores. La interoperabilidad entre motores se decidirá mediante mediciones, no por preferencias de herramientas.

## 3. Principios transversales

1. **Local-first y consentimiento:** los datos nunca se suben de forma automática.
2. **Screaming + hexagonal pragmática:** agrupar por dominio; separar dominio, casos de uso, puertos, infraestructura y presentación donde tenga valor.
3. **Dataset original inmutable:** derivar versiones y guardar linaje.
4. **Resultados reproducibles:** parámetros, fuente, filtros, transformaciones, cobertura y fórmulas.
5. **Motor correcto por trabajo:** DuckDB para tablas; Python para ciencia estadística; Rust para algoritmos intensivos justificados; TypeScript para orquestación e interfaz.
6. **Seguridad:** archivos no confiables, límites de memoria/tiempo/descompresión, validación de nombres SQL, sanitización de reportes y exportaciones.
7. **Experiencia robusta:** errores claros, estados de progreso reales, cancelación cuando sea posible, recuperación de Workers.
8. **Capacidad medida:** no asegurar rendimiento universal por MB o filas.
9. **Entrega progresiva:** documentar qué está hecho y qué falta; ninguna fase depende de completar todas las demás.

## 4. Fases

### Fase 0 — Prueba de viabilidad arquitectónica

**Objetivo:** validar, con mediciones, la convivencia de los motores dentro del navegador y el despliegue estático. Se divide en tres spikes que pueden cerrarse por separado. Los umbrales y el protocolo de medición están en el [ADR-0002](adr/0002-motores-analiticos-y-criterios-de-corte.md).

#### Fase 0A — Fundamento tabular (prioridad inmediata)

**Alcance**
- Esqueleto Next.js/React/TS strict y, si el esfuerzo es acotado, el mismo spike en Vite para comparar ([ADR-0001](adr/0001-framework-y-exportacion-estatica.md)).
- Generación estática y despliegue en Vercel.
- Worker con DuckDB-Wasm: importar CSV y XLSX, consultar con SQL y devolver vista previa.
- XLSX por dos rutas: lectura directa con DuckDB-Wasm (a comprobar) o parser JavaScript en un Worker.
- Medir tiempos, memoria y bloqueo de la interfaz con el protocolo del ADR-0002.
- Comprobar CSP, headers necesarios y compatibilidad básica de navegador.

**Criterios de aceptación**
- Un archivo real se importa, se consulta con SQL y se muestra sin bloquear la UI.
- Los resultados coinciden con una referencia independiente.
- Existe build estático funcional, smoke test y despliegue en Vercel.
- Las mediciones quedan registradas en el ADR-0002 y el ADR-0001 refleja la decisión de framework.

#### Fase 0B — Python científico (investigación acotada)

**Alcance**
- Pyodide con carga diferida en un Worker y una función Python mínima.
- Transferencia de un subconjunto de datos desde DuckDB (Arrow o arreglos tipados); medir copias y memoria.
- Evaluar DuckDB dentro de Pyodide como alternativa si mantener dos runtimes resulta demasiado costoso.

**Criterios de aceptación:** calcular una métrica y compararla con una referencia independiente; medir el arranque en frío, en caliente y tras cargar paquetes; comprobar que Pyodide no se carga al iniciar la aplicación.

#### Fase 0C — Rust y WebAssembly (investigación acotada)

**Alcance**
- Compilar con wasm-bindgen e integrar una función desde TypeScript en un Worker.
- DTW exacto frente a una implementación en TypeScript; intercambio de vectores numéricos.
- Definir el caso de uso que justifica DTW (ver ADR-0002).

**Criterios de aceptación:** resultados dentro de tolerancia; tiempo y memoria medidos **incluyendo transferencia e inicialización**; decisión con evidencia sobre si Rust es obligatorio, opcional o se descarta para ese cálculo.

**Entrega de la fase 0:** spikes técnicos, CI inicial, ADR-0001 y ADR-0002 con resultados y decisiones. No iniciar todos los módulos definitivos. Las fases 0B y 0C no bloquean el MVP (0A hasta 3B).

### Fase 1 — Fundamentos del producto y gestión local

**Objetivo:** identidad visual, navegación y modelo básico de carpetas/proyectos.

**Alcance**
- Landing pública en español, CTA para importar y probar demo.
- UI basada en mockups: sidebar oscura, contenido claro, inspector contextual.
- shadcn/ui, Tailwind y Lucide; tokens, estados accesibles, responsive.
- Gestión local de carpetas y proyectos: crear, renombrar, mover, eliminar y buscar.
- Modelo de dominio independiente de IndexedDB/OPFS.
- Repositorios locales para metadatos y preferencias.
- Datasets de demostración de ventas, finanzas y encuestas (datos ficticios o públicos).
- Explicar claramente «almacenado en este dispositivo».

**Criterios de aceptación:** navegación y persistencia local funcionan sin cuenta; diseño uniforme y accesible; no se introducen secretos ni backend de procesamiento.

**Entrega:** shell funcional, design system y primeros tests.

### Fase 2 — Importación multiformato y Data Explorer

**Objetivo:** cargar datos reales con seguridad, entender su estructura y navegar eficientemente.

**Alcance**
- CSV, XLSX, JSON tabular, Parquet.
- Selección de hoja, fila de encabezados, delimitador, encoding, columnas y tipos.
- Vista previa limitada, paginada/virtualizada; filtros y orden.
- Diccionario de datos: tipo físico y rol semántico editable.
- Profiling: nulos, tipos, cardinalidad, duplicados potenciales, rangos, frecuencias.
- Errores de formato, datos malformados, columnas anchas, formatos regionales.
- Ingesta mediante capacidades nativas de DuckDB cuando corresponda.
- Tests con fixtures pequeños y medianos; medir importación por formato.

**Objetivos provisionales de validación, NO garantías**
- CSV/Parquet: 20 MB iniciales por archivo.
- XLSX: 10 MB iniciales por archivo.
- Caso típico: ~100.000 filas con ancho moderado.
- Estrés: 500.000 filas / 100 MB en formatos adecuados; ajustar a benchmarks.
- La paginación visual no se considera ingesta incremental.

**Criterios de aceptación:** cada formato tabular soportado se importa correctamente; el usuario puede confirmar tipos y columnas; errores conservan datasets ya cargados; nunca se renderizan todas las filas.

### Fase 3 — Estadística descriptiva y Visual Analytics

**Objetivo:** primer análisis útil de un dataset arbitrario.

**Alcance**
- Media, mediana, moda, mínimo, máximo, rango, suma, varianza, desvío, cuartiles, percentiles, IQR.
- Frecuencias categóricas, distribuciones, agrupaciones y correlaciones justificadas.
- Barras, líneas, torta para pocas categorías, histogramas, scatter, boxplots, heatmaps y tablas dinámicas simples.
- Sugerir gráficos por roles semánticos, no solo tipos físicos.
- Selección de ejes, métricas, agregaciones, filtros y exportación de visualizaciones.
- Hallazgos básicos basados en reglas transparentes, enlazados a consultas y datos de respaldo.

**Criterios de aceptación:** cálculos cotejados con fixtures de referencia; no media de identificadores; no inferencia causal por correlación; resúmenes, no millones de puntos en el gráfico.

### Fase 3B — Finanzas Lite (primer caso real)

**Objetivo:** demostrar temprano un caso de uso real sobre las fases 1–3, sin esperar a la plataforma completa.

**Alcance**
- Registro manual de ingresos y gastos: fecha, descripción, importe, moneda (ARS/USD), categoría y notas; alta, edición y baja.
- Proyecto local, saldo por período, resumen mensual y gráficos básicos.
- Importes sin coma flotante binaria, con redondeo explícito.
- **Fuera de esta fase:** cuentas, transferencias, cotizaciones y conversión ARS/USD, recurrencias, presupuestos, predicciones, importación bancaria e inflación. Cada moneda se muestra por separado.

**Criterios de aceptación:** registro manual sin archivo; los datos persisten tras recargar; totales por moneda coinciden con fixtures de referencia; ARS y USD nunca se suman ni se convierten implícitamente.

**Hito R1:** MVP de exploración, visualización y Finanzas Lite, público y usable. Ver [MVP.md](MVP.md).

### Fase 4 — Limpieza, pipelines y múltiples datasets

**Objetivo:** preparación y composición de datos con trazabilidad.

**Alcance**
- Renombrar columnas, transformar tipos, normalizar fechas/texto, filtrar, ordenar, deduplicar, tratar nulos, crear expresiones y agregaciones.
- Pipeline declarativo con pasos ordenados, preview, manejo de errores, repetir/editar/deshacer mediante versiones.
- Comparación antes/después: filas afectadas, nulos, duplicados y métricas.
- Varias fuentes por proyecto, APPEND/UNION con mapeo de esquemas, JOIN con clave/tipo/cardinalidad confirmados, comparación entre períodos.
- DatasetSource inmutable; DatasetVersion derivada; PipelineDefinition/Execution y DataLineage.
- Impedir multiplicaciones involuntarias de importes por joins uno-a-muchos.

**Criterios de aceptación:** las fuentes originales no cambian; pipeline repetible; errores no dejan estados parciales; relaciones se validan antes de unir.

### Fase 5 — Data Insights, Report Builder y proyectos portables

**Objetivo:** generar entregables útiles y auditables.

**Alcance**
- Constructor de informes con secciones reordenables: resumen, fuentes, calidad, métricas, gráficos, observaciones, conclusiones propias, metodología y límites.
- Hallazgos verificables con fuente y parámetros.
- Exportar HTML, imprimir/guardar como PDF, CSV/Parquet procesado y gráficos.
- Guardar AnalysisSnapshot y visualizaciones.
- Exportar/importar proyecto portable versionado (datos incluidos opcionalmente).
- Trazar versión de datos y pasos del pipeline que produjeron el informe.

**Criterios de aceptación:** informes reproducibles; los datos no se modifican por exportación; textos/HTML se sanitizan; proyectos se recuperan desde respaldo.

**Hito R2:** entorno analítico general, con pipelines, múltiples datos e informes.

### Fase 6 — Plantilla Finanzas Personales: entrada manual y análisis

**Objetivo:** ampliar [Finanzas Lite](#fase-3b--finanzas-lite-primer-caso-real) con cuentas, transferencias, importación por archivo, detección de duplicados y dashboard completo.

**Alcance**
- Entidades de cuentas, categorías, ingresos, gastos, transferencias, reintegros, presupuestos y movimientos.
- Formulario manual: fecha, descripción, importe, moneda, categoría, cuenta, notas; alta, edición, duplicación y baja.
- Importar CSV/XLSX y mapear columnas al modelo financiero con confirmación.
- Detección de duplicados al combinar importación y carga manual.
- Dashboard: ingresos, egresos, saldo por período, categoría, evolución, movimientos destacados.
- Informes financieros y almacenamiento local.
- Importes con decimales/unidades menores adecuados, no floats binarios para contabilidad.

**Criterios de aceptación:** registro manual sin archivo; una transferencia propia no es gasto; pago de tarjeta no duplica consumo; totales coinciden con fixtures de referencia; se conserva moneda original.

**Hito R3:** Finanzas Personales completas, utilizables sin cuenta.

### Fase 7 — Finanzas avanzadas y cotizaciones

**Objetivo:** presupuestos, recurrencias y análisis ARS/USD reproducible.

**Alcance**
- Presupuestos por categoría, gastos recurrentes, cuotas, gastos divididos, comparaciones de períodos.
- Conversión entre ARS y USD: dólar oficial, MEP, CCL o manual; comparar las tres series, **sin promediarlas arbitrariamente**.
- Fecha histórica por movimiento o última fecha disponible, fuente, compra/venta, criterio de fecha faltante y snapshot utilizado.
- Evaluar APIs públicas: DolarAPI, ArgentinaDatos, BCRA según coberturas, CORS y términos.
- Operación offline/degradada: conservar cotizaciones consultadas o permitir tasa manual.
- Ajuste por inflación mediante IPC: indicar fuente, período base y metodología, y distinguir montos nominales de montos ajustados. Un análisis multianual de importes en pesos sin este ajuste puede inducir a conclusiones engañosas.
- Sin sincronización bancaria ni asesoramiento financiero automatizado.

**Criterios de aceptación:** conversiones reproducibles; no doble cómputo de recurrencias; proveedor de cotizaciones caído no bloquea el producto; precisión monetaria validada; ajuste por IPC con fuente y metodología documentadas.

### Fase 7B — Plantillas Ventas y Negocios / Encuestas e Investigación

**Objetivo:** nuevas experiencias especializadas usando el motor general, sin aplicaciones paralelas.

**Ventas y negocios**
- Importación de operaciones comerciales y mapeo de columnas.
- Facturación bruta/neta cuando corresponda, evolución por fecha, cantidad, producto y categoría.
- Descuentos, devoluciones e impuestos explícitos.
- Tablas de productos destacados, comparaciones por período, gráficos e informes.
- Rentabilidad solo si el dataset incluye costos apropiados.
- Opciones avanzadas futuras: demanda, estacionalidad, anomalías comerciales.

**Encuestas e investigación**
- Importación de respuestas de formularios/hojas.
- Tipificación: preguntas categóricas, numéricas, selección múltiple, escalas de Likert.
- Frecuencias absolutas y relativas, distribuciones, cruces por segmentos.
- Tablas de contingencia, porcentajes con denominadores correctos y respuestas faltantes.
- Informes con tamaño muestral, cobertura, supuestos y límites.
- Inferencia estadística futura si el diseño del estudio lo permite.

**Criterios de aceptación**
- Las plantillas no duplican SQL, plotting ni exportación.
- Ventas evita doble conteo por joins; ajustes y descuentos documentados.
- Encuestas no trata respuesta múltiple como elección única.
- Ambas poseen fixtures y datasets de demo, análisis verificables e informes reutilizables.

**Hito R3B:** tres plantillas especializadas más análisis libre.

### Fase 8 — Python científico y predicciones

**Objetivo:** aplicar análisis estadístico avanzado con Pyodide bajo demanda.

**Alcance**
- Worker de Pyodide, adaptadores, selección acotada de columnas, validación de memoria.
- Pandas/NumPy/SciPy; statsmodels cuando sea compatible.
- Intervalos de confianza, pruebas estadísticas adecuadas, regresión y diagnósticos, Spearman, análisis de distribución.
- Forecasting con baselines ingenuo/estacional y modelos seleccionados; backtesting temporal.
- MAE, RMSE, cobertura de datos y rangos de incertidumbre donde proceda.
- Explicar supuestos y evitar filtración temporal.

**Criterios de aceptación:** tests numéricos independientes; la estadística no se ejecuta sin datos/hipótesis válidos; Pyodide se carga solo al utilizarlo.

### Fase 9 — Rust/Wasm y Time-Series Studio

**Objetivo:** procesamiento especializado integrado, no una aplicación separada.

**Alcance**
- Núcleo Rust: distancia euclidiana, DTW exacto, memoria reducida, ventana Sakoe-Chiba, ruta de alineamiento según necesidad.
- Consumir series seleccionadas desde datasets, validar frecuencia, nulos, longitud, escalado y normalización.
- Visualizaciones comparativas, alineamientos y matrices por pares con límites.
- Compilar WASM; Worker y contrato TypeScript; buffers numéricos, tests y benchmark contra referencias.
- Comparar también overhead de transferencia/arranque, no solo tiempo del algoritmo.

**Criterios de aceptación:** resultados dentro de tolerancias, casos extremos comprobados, límites computacionales y errores comprensibles; sin prometer speedups no medidos.

**Hito R4:** motores tabular, científico y Rust especializados e integrados.

### Fase 10 — Optimización y modelado (opcional)

**Objetivo:** resolver escenarios de investigación operativa y modelos estadísticos acotados.

**Alcance**
- Plantillas de asignación de recursos, mezcla de producción o presupuestos.
- Programación lineal/entera mixta con SciPy si está disponible en Pyodide.
- Objetivos, restricciones, variables y estado del solucionador explícitos.
- Diagnósticos de regresión y econometría exploratoria, evitando interpretaciones causales injustificadas.

**Criterios de aceptación:** escenarios pequeños, límites de tiempo/memoria, validación numérica, distinción óptimo/factible/aproximado/fallido.

### Fase 11 — Hardening y release de portfolio

**Objetivo:** producto estable, auditable y publicable.

**Alcance**
- Accesibilidad, responsive y navegación por teclado.
- Tests de dominio, contratos, integraciones, E2E y fallos de Workers.
- Importaciones corruptas/hostiles, seguridad de exportaciones, dependencias.
- Benchmark por navegador y equipo: 1k×10, 10k×20, 100k×30, 100k×100, estrés opcional 500k×30.
- Medir tamaño del bundle, inicialización de WASM/Python, memoria, profiling, consultas, gráficos.
- Persistencia, mecanismos de respaldo, actualización de docs, mockups sustituidos por capturas reales.
- Demo pública y README con hechos verificables.

**Hito R5:** lanzamiento consolidado de portfolio.

## 5. Línea opcional Cloud (no bloquea R1–R5)

> **Visión futura, fuera del MVP.** No se implementa nada de esta línea antes de cerrar R1 y aprobar expresamente su inicio.

### Cloud C1 — Cuentas y sincronización ligera
- Next.js con funciones de servidor cuando se justifique; revisar salida estática.
- Proveedor de autenticación evaluado; Neon PostgreSQL para cuentas y metadatos.
- Carpetas/proyectos, pipelines e informes sincronizados mediante adaptador remoto.
- Migración **voluntaria** de datos locales; autorización por propietario y borrado de datos.
- Los datasets originales siguen **locales por defecto**.
- Una sesión en otro dispositivo puede ver metadatos, pero no recalcular sin disponer de archivos.

### Cloud C2 — Sincronización completa y privada
- Subida opcional y explícita de archivos a almacenamiento de objetos privado.
- Descargar, versionar y eliminar datos; límites de cuota y costos.
- Evaluar privacidad, seguridad, encriptación, respaldo y cumplimiento antes de implementar.
- Evitar guardar archivos binarios grandes directamente en PostgreSQL.

## 6. Modelo de dominio previsto

**Compartidos:** Folder, Project, DatasetSource, DatasetVersion, DatasetSchema, SemanticColumn, PipelineDefinition, PipelineExecution, AnalysisSnapshot, Visualization, Report, DataLineage, UserPreferences.

**Finanzas:** FinancialAccount, FinancialTransaction, FinancialCategory, Budget, RecurrenceRule, ExchangeRateSnapshot.

**Plantillas:** SalesMapping, SurveyQuestionDefinition y reglas específicas solo cuando un caso de uso real lo requiera.

## 7. Calidad por fase — Definition of Done

- Funcionalidad real completada contra criterios de aceptación.
- Tests relevantes ejecutados y resultados reportados.
- Build y ejecución de la etapa sin regresiones.
- Limitaciones, riesgos y errores conocidos documentados.
- Cálculos estadísticos y financieros cotejados con referencias independientes.
- Los datos originales se mantienen intactos.
- README y documentos muestran implementación efectiva vs planes.
- No se incorporan dependencias, abstracciones, cuentas o servidores sin justificación.
- Cada fase puede demostrarse con fixtures o datasets accesibles.

## 8. Releases

| Release | Fases | Valor |
|---|---|---|
| R0 | 0A–0C | Viabilidad técnica (0A es prioritaria; 0B y 0C no bloquean R1) |
| R1 | 1–3B | MVP: exploración, visualización y Finanzas Lite |
| R2 | 4–5 | Pipelines, múltiples datos e informes |
| R3 | 6–7 | Finanzas completas y avanzadas |
| R3B | 7B | Ventas y encuestas |
| R4 | 8–9 | Python científico y Rust/DTW |
| R5 | 11 | Calidad y portfolio |
| Cloud | C1–C2 | Cuentas y nube optativas |

Fase 10 no bloquea R5.

## 9. Fuera de alcance inicial

- Conectores bancarios y extracción automática de movimientos financieros.
- Backend analítico o procesamiento distribuido.
- Autenticación obligatoria.
- Colaboración multiusuario en tiempo real.
- Promesas de disponibilidad o almacenamiento ilimitados.
- Deep learning intensivo y asesoramiento financiero.
- Convertir DataForge en un ERP, un BI empresarial completo o un servicio SaaS comercial.

## 10. Próximas acciones

- [x] Publicar README y documentación en español.
- [ ] Crear PRD y flujos de usuario.
- [x] Documentar sistema de diseño y mockups como referencias.
- [x] Redactar ADR-0001 y ADR-0002 (estado «Propuesto», pendientes de resultados).
- [x] Definir el MVP acotado ([MVP.md](MVP.md)) y mover las reglas de agentes a [AGENTS.md](../AGENTS.md).
- [ ] Preparar issues acotados de la fase 0A.
- [ ] Implementar el spike 0A, medir y cerrar el ADR-0001.
- [ ] Spikes 0B y 0C; cerrar el ADR-0002 con resultados.
- [ ] Registrar límites reales antes de ampliar el producto.

**Regla rectora:** primero una plataforma que resuelva correctamente análisis comunes; después profundizar con plantillas y ciencia de datos especializada.

**Regla de ejecución:** no se agregan herramientas ni fases al roadmap antes de completar la fase 0A; la siguiente decisión surge de resultados técnicos observables.

## 11. Extensiones aprobadas para planificación (sin bloquear el MVP)

> **Visión futura, fuera del MVP.** Se documentan para conservar la dirección del producto, no como compromiso de implementación.

### Fase 4B — Conectores REST de lectura

- Importar JSON/CSV desde APIs públicas compatibles con CORS y mapear a DatasetSource.
- Para endpoints privados, utilizar conectores backend con destinos permitidos y proteger secretos. Nunca implementar proxy libre de URLs (riesgo SSRF).
- Manejar paginación, rate limits, errores, procedencia, versiones y consentimiento.
- **Criterio:** importar una API demo y comparar registros con origen; permisos y fallos verificables.
- **Documento:** [DataForge Connect](integrations.md).

### Fase 5B-A — IA local y reportes asistidos

- Crear Context Builder a partir de métricas/snapshots validados; respuestas y hallazgos con evidencias.
- Evaluar Chrome Built-in AI/Prompt/Summarizer en navegador compatible, sin fallback remoto silencioso.
- Chatbot contextual de solo lectura e informes explicativos, con edición humana.
- Mantener modo reglas locales si no hay modelo.
- **Criterio:** sin envío de información en modo local; sin invención de métricas ni bloqueo al faltar Chrome AI.

### Fase 5B-B — IA remota opcional

- Vercel AI Gateway + AI SDK, streaming de chatbot e informes estructurados.
- Cuota global con límites y kill switch. El almacenamiento persistente de claves BYOK en el servidor (AES-256-GCM) se difiere hasta que existan cuentas conectadas; no se ofrece una clave global a usuarios anónimos sin defensas reales contra abuso.
- Consentimiento informado y vista previa del contexto a compartir; respetar tratamiento de datos de los proveedores.
- Requiere API segura de Next.js: **no compatible con exportación puramente estática**.
- Validar límites reales del nivel gratuito antes de habilitar clave global pública.
- **Documento:** [DataForge AI](ai-assistant.md).

### Fase 5B-C — Consultas asistidas (text-to-SQL controlado)

- La IA propone una consulta; el usuario la ve y la aprueba antes de ejecutarla.
- Ejecución de solo lectura sobre tablas autorizadas, con límites de tiempo y memoria y sin acceso a archivos ni funciones externas. Que una consulta comience con `SELECT` no basta para considerarla segura.
- **Criterio:** ninguna consulta modifica datasets ni accede a recursos no autorizados; los resultados se identifican como generados por una consulta asistida.
- Funcionalidad avanzada: **no pertenece al MVP**.

### Cloud C3 — API entrante de integración

- API keys de alta entropía mostradas una vez y almacenadas como digest.
- Endpoints autenticados para eventos/snapshots y almacenamiento temporal aunque el navegador esté cerrado.
- Idempotencia, scopes por fuente/proyecto, autorización, cuotas, auditoría y caducidad.
- Ingesta de archivos grandes mediante storage privado y cargas temporales.
- Procesamiento analítico sigue siendo local al importar al workspace.
- **Documento:** [DataForge Connect](integrations.md).

### Cloud C0 — Autenticación y recuperación

- Registro opcional por email/contraseña; login, verificación y recuperación gestionados por proveedor.
- Evaluar Neon Auth y Better Auth con correo transaccional; **Nodemailer no sustituye SMTP ni proveedor de email**.
- Cuentas propuestas para **mayores de 18 años**, sujeto a revisión jurídica; app local anónima disponible sin registro.
- Validar cuotas, dominio/remitente, sesiones, permisos y restablecimiento antes del lanzamiento.
- **Documento:** [Autenticación](authentication.md).

### Política, documentación y cumplimiento

- Antes de cuentas, IA remota o ingesta cloud en producción: completar entidad responsable, email de contacto, base legal, jurisdicción, tratamiento de menores, proveedores, retención y derechos.
- Los documentos en `docs/legal/` son **borradores no publicables**, no un escudo frente a reclamos ni sustituto de cumplimiento.
- Mantener términos, privacidad, descargos IA/finanzas y consentimientos ajustados a implementación real.
- **Referencias:** [Términos](legal/terms-of-use.md) · [Privacidad](legal/privacy-policy.md) · [Avisos IA y finanzas](legal/ai-financial-disclaimer.md).

### Diseño aprobado

- Guía UI versionada: [Mockup y decisiones de interfaz](design/README.md).
- La maqueta vectorial y los tres PNG originales están versionados en [`design/mockups`](design/mockups/README.md).
- La navegación documentada en la guía de diseño prevalece sobre los textos de los mockups.

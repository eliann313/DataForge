# DataForge — Plan de primeras entregas

> **Estado:** E1–E6 cerradas; R1 completo. Seguimiento actual: R2 / fase 4.
> **Fecha:** 2026-10-11 (plan); **avance:** 2026-10-12 en `codex/r2-phase4-pipelines` (PR #16 hacia `develop`).
> **Base verificada:** documentación, ADR-0001 y ADR-0003 aceptados, ADR-0002 con
> tabular medido (global propuesto hasta 0B/0C), 0A.1–0A.6, E3.1–E3.3, E4
> (JSON/Parquet, filtros, roles, profiling), E5 (descriptivos, ECharts,
> correlación, hallazgos) y E6 (Finanzas Lite exacta); R2 agrega pipelines locales
> tipados, definiciones por proyecto en IndexedDB, varias fuentes aisladas por
> proyecto durante la sesión, APPEND/UNION ALL y JOIN con cardinalidad/fanout
> validados. Este incremento pasó tipado, lint, Vitest 67/67 y Playwright de
> pipelines 32/32 en Chromium/Firefox; el flujo APPEND con limpieza de linaje
> también pasó 2/2 en ambos navegadores. Build estático correcto y smoke
> estático 47/47 en Chromium.
> **Fase activa:** R2 (fases 4–5) tras el cierre de R1 el 2026-10-12.
> 0B/0C siguen como investigación pendiente y no bloquean.
> Este plan divide las fases existentes en entregas; no agrega fases ni cambia
> los criterios del MVP.

## Objetivo y alcance decidido

El objetivo original de llegar a **R1** mediante seis entregas demostrables ya se cumplió: importar y consultar un archivo; validar Excel y el hosting; organizar proyectos locales; explorar calidad; analizar y graficar; registrar Finanzas Lite.

La primera entrega resolvió un recorrido completo con un CSV real. La segunda cerró la viabilidad de 0A antes de invertir en la interfaz definitiva. El MVP terminó con Finanzas Lite; la siguiente fase ya no es parte del MVP.

El orden ejecutado fue **E1 → E2 → E3 → E4 → E5 → E6**. Las condiciones detalladas debajo conservan el alcance y la evidencia de esas entregas; ya no son backlog pendiente. La fase activa actual es 4 dentro de R2.

## Entregas y condiciones de cierre

| Entrega | Fase existente | Resultado demostrable | Condición de cierre |
|---|---|---|---|
| **E1 — CSV real de punta a punta** | 0A, parcial | Elegir CSV, importarlo en DuckDB-Wasm en Worker y ver esquema, cantidad de filas y preview paginada | Consultas reales correctas contra fixtures independientes; errores recuperables; build estático y CI inicial |
| **E2 — Excel y viabilidad comprobada** | Cierre de 0A | Importar CSV/XLSX en una demo estática de Vercel con límites y compatibilidad documentados | Ruta XLSX probada, mediciones repetibles, smoke del despliegue, ADR-0001 resuelto y resultados tabulares en ADR-0002 |
| **E3 — Proyectos locales utilizables** | 1 | Entrar sin cuenta, probar ejemplos, crear y organizar proyectos/carpetas y recuperarlos tras recargar | Persistencia de metadatos comprobada, navegación consistente, manejo de cuotas y fallos de almacenamiento |
| **E4 — Data Explorer** | 2 | Importar CSV/XLSX/JSON tabular/Parquet, confirmar esquema y explorar calidad con filtros y orden | Cuatro formatos verificados; tabla limitada; nulos, cardinalidad, rangos y duplicados potenciales correctos; fallos no corrompen lo cargado |
| **E5 — Análisis y gráficos** | 3 | Obtener estadística descriptiva, configurar gráficos y revisar hallazgos respaldados por cálculos | Resultados contra referencias independientes, unidades/denominadores visibles, gráficos agregados y roles semánticos respetados |
| **E6 — Finanzas Lite y cierre de R1** | 3B | Registrar ingresos/gastos manualmente y recuperar resumen mensual ARS/USD tras recargar | CRUD persistente, totales exactos por moneda, gráficos y recorridos completos de R1 verificados en demo pública |

E1 es un incremento técnico revisable, **no cierra 0A ni equivale a R1**. E2 cierra únicamente 0A; 0B/0C siguen como investigación pendiente y no bloquean el producto.

El cierre de E1–E6 se verificó en la demo pública R1. El avance de fase 4 que sigue está en el checkout local y todavía no forma parte de esa demo.

### E1 — CSV real de punta a punta

**Incluye:** Next.js como candidato, React, TypeScript strict, pantalla técnica mínima en español, carga diferida de DuckDB-Wasm, Worker y contrato tipado, importación de un archivo por vez, consultas internas y preview acotada.

- Ejecutar `COUNT`, consulta de esquema, selección paginada y una agregación sobre un fixture numérico. Mostrar resultados calculados, sin cifras de mockups.
- Primera configuración CSV: UTF-8, encabezados y delimitadores coma/punto y coma; campos entrecomillados. Documentar variantes aún no soportadas.
- Generar identificadores internos seguros; parametrizar valores y validar/escapar nombres. La SQL la controla la aplicación: no incluir editor de SQL arbitrario en este spike.
- Mantener fuente original intacta y liberar recursos al reemplazar el archivo. No prometer persistencia del dataset en esta entrega.
- Estados vacío, inicialización, importación, resultado y error; actividad real, sin porcentajes inventados. UI utilizable con teclado y ancho móvil básico.
- Fallo de Worker, archivo vacío/malformado y exceso de límite no deben dejar la aplicación inutilizable. Si cancelar exige reiniciar el Worker, explicitar el efecto sobre los datos en memoria y permitir reimportar.

**Demostración:** desde instalación limpia, abrir el build estático, cargar CSV propio y fixture, revisar resultado de consultas, provocar un fallo y cargar otro archivo correctamente.

**Fuera de E1:** landing definitiva, proyectos, profiling completo, gráficos, otros formatos y persistencia. No instalar bibliotecas destinadas a esas funcionalidades.

### E2 — Excel y viabilidad comprobada

- Probar lectura XLSX directa en la versión fijada de DuckDB-Wasm y registrar el resultado. Si no funciona, utilizar parser JavaScript en Worker, elegido por compatibilidad, mantenimiento, licencia, tipos, memoria y límites de descompresión.
- Importar hojas tabulares; permitir seleccionar hoja cuando hay varias. Comprobar encabezados, celdas vacías, fechas, números y fórmulas con valor almacenado. No ejecutar fórmulas; informar fórmulas sin valor almacenado y hojas no tabulares.
- Rechazar XLSX corruptos y expansiones fuera de los límites antes de comprometer memoria. Un límite sobre el ZIP comprimido por sí solo no alcanza.
- Servir Workers/WASM con rutas estáticas y verificar CSP, tipos MIME y headers. Activar COOP/COEP solo si una capacidad realmente utilizada lo exige.
- Registrar carga inicial, bundle, arranque frío/caliente, importación + preview, memoria cuando sea observable y respuesta de la UI.
- Chromium y al menos otro navegador de escritorio; responsive no implica que se haya certificado capacidad analítica móvil.
- Preparar build estático, configuración de hosting y smoke; cerrar con una URL de Vercel que ejecute el mismo recorrido. Si falta acceso al hosting, dejarlo como bloqueo explícito: un build local no acredita despliegue.

**Decisión de framework:** conservar Next.js si funciona sin soluciones invasivas. Comparar el mismo flujo en Vite solo si aparece una fricción significativa o la comparación es acotada. Registrar evidencia de Workers, assets, rutas, configuración, bundle y build en ADR-0001.

**Decisión de motores:** registrar hallazgos de DuckDB/XLSX y límites en ADR-0002. Mantener el ADR global propuesto mientras falten 0B/0C; no afirmar validada la convivencia con Python/Rust.

**Demostración:** en la URL estática, importar CSV y XLSX real con varias hojas, consultar y ver preview; provocar archivo corrupto y recuperar; acompañar la demo con informe de mediciones y restricciones.

### E3 — Proyectos locales utilizables

- Landing con «Importar mis datos» y «Probar un ejemplo», indicando únicamente capacidades existentes.
- Shell con sidebar oscura, contenido claro, contexto de proyecto e inspector adaptable. Mostrar secciones según funcionalidades disponibles y respetar la navegación documentada.
- Crear, abrir, renombrar, mover, eliminar y buscar carpetas/proyectos; confirmación de acciones destructivas y aislamiento entre proyectos.
- Modelo y casos de uso de `projects` independientes del adaptador IndexedDB; esquema de persistencia versionado y escrituras sin estados parciales.
- Ejemplos ficticios de ventas, finanzas y encuestas reutilizando importación general. Estos datasets no habilitan las plantillas especializadas posteriores.
- Explicar «Almacenado en este dispositivo» y distinguir metadatos guardados de archivos disponibles. Si un archivo no se conserva, ofrecer reimportación identificable; no aparentar recuperación de datos inexistentes.

**Cierre:** crear dos proyectos, mover/renombrar, recargar y recuperar metadatos, abrir ejemplos y probar escritura fallida sin pérdida silenciosa. Decidir persistencia de archivos/OPFS con evidencia; no hacer de OPFS un requisito de cada módulo.

### E4 — Data Explorer

- Ampliar los importadores con JSON tabular y Parquet; declarar formas soportadas y límites medidos por formato.
- Configurar hojas, encabezados, delimitador, encoding soportado, selección de columnas y tipos. Preservar archivo original y parámetros de interpretación.
- Tabla paginada/virtualizada con filtros y orden aplicados sobre el dataset completo en DuckDB, no solamente sobre la página visible.
- Diccionario con tipo físico y rol semántico editable; profiling de nulos, cardinalidad, rangos, frecuencias y duplicados potenciales con definición visible.
- Señalar errores de conversión, fechas ambiguas y formatos `es-AR`; no corregir ni eliminar datos silenciosamente.

**Cierre:** importar los cuatro formatos con fixtures y archivos reales; verificar profiling contra referencias; confirmar que fallo de importación conserva el dataset activo y nunca se renderiza la tabla completa. Detectar calidad pertenece a R1; limpiar y versionar transformaciones pertenece a R2.

### E5 — Análisis y gráficos

Dividir el trabajo dentro de la fase 3 sin declarar cierre anticipado:

1. Descriptivos: conteo válido/faltante, suma, media, mediana, moda, mínimo/máximo, rango, varianza, desvío, cuartiles, percentiles e IQR; frecuencias y agrupaciones.
2. Visualizaciones: barras, líneas, histogramas; luego dispersión, boxplots, heatmaps, sectores para pocas categorías y tablas dinámicas simples. Selección de ejes, agregaciones, filtros y exportación de figuras.
3. Correlaciones justificadas y hallazgos por reglas transparentes; sugerencias por rol semántico y evidencia enlazada a parámetros/fuente.

Definir varianza muestral/poblacional, percentiles, empates de moda y tratamiento de nulos antes de validar fixtures. Exponer muestra, unidades y filtros; evitar media de identificadores y sumas entre monedas. Los gráficos reciben agregados o muestras declaradas, nunca millones de puntos sin control. Ofrecer alternativa tabular accesible.

**Cierre:** cambiar selección/filtros y obtener estadísticas y gráfico consistentes con referencias independientes. La demo no atribuye causalidad a correlaciones y distingue hallazgo calculado de interpretación. SQL/TypeScript bastan para esta fase; no introducir Pyodide.

### E6 — Finanzas Lite y cierre de R1

- Proyecto financiero local: fecha, descripción, importe, moneda ARS/USD, categoría y notas; alta, edición y baja de ingresos/gastos.
- Usar unidades menores exactas o decimal; decidir rango, escala y redondeo. No sumar flotantes binarios para contabilidad.
- Resumen mensual y saldo por período separado por moneda; barras por categoría y evolución mensual.
- Persistencia local de movimientos y fallos visibles: nunca indicar «Guardado» antes de confirmar escritura.
- Validar CRUD, fechas y cortes mensuales, importes inválidos, límites y precisión con fixtures independientes, incluyendo mezclas de monedas.

**Cierre de R1:** una persona nueva importa CSV/XLSX, revisa calidad y genera estadística y gráfico; otra registra movimientos sin archivo, recarga y recupera totales exactos ARS/USD. Ambas recorren la demo sin cuenta. README, límites, mediciones y capturas describen la implementación real.

## R2 / fase 4 — avance actual

### Cortes locales implementados (2026-10-12)

- Pasos tipados para filtrar filas, seleccionar y renombrar columnas, quitar filas con nulos en columnas elegidas, reemplazar nulos, quitar duplicados exactamente iguales y ordenar.
- Los filtros respetan el tipo físico: una igualdad sobre texto conserva valores como `00123`; las comparaciones mayor/menor solo se permiten en columnas numéricas y validan el literal.
- Vista previa con cantidad de filas antes/después y muestra acotada.
- Ejecutar crea una vista DuckDB derivada, sin sobrescribir la fuente; se puede activar de nuevo la versión fuente o una derivada.
- Conversión explícita a `INTEGER`, `BIGINT`, `DECIMAL(p,s)`, `BOOLEAN` o `VARCHAR`. La vista previa y la ejecución rechazan valores incompatibles, desbordes o conversiones que pierdan precisión; los nulos se conservan.
- Normalización de texto de fecha a `DATE` mediante formatos explícitos (`YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY`, `DD-MM-YYYY` y `YYYY-MM-DD HH:mm:ss`); las fechas inválidas se rechazan antes de crear una versión.
- La definición puede guardarse por proyecto en IndexedDB y se valida contra el esquema activo al cargarla. Varias fuentes y versiones de cada proyecto viven solo en el Worker durante la sesión. APPEND conserva duplicados con `UNION ALL`, valida tipos/mapeos; JOIN verifica tipos de clave, cardinalidad y fanout y exige confirmación antes de aceptar multiplicación de filas. Las combinaciones guardan ambos padres y todas las fuentes de linaje. Quitar una fuente elimina sus vistas dependientes. Los archivos y resultados se pierden al cerrar/recargar; OPFS y exportación portable siguen diferidos a fase 5.
- Las pruebas E2E cubren aislamiento de proyectos, duplicados en APPEND, rechazo por cardinalidad incorrecta, confirmación de fanout y limpieza de versiones al quitar una fuente.
- Los identificadores SQL se escapan, los valores de filtro se codifican y no se acepta SQL libre. Un error de validación no crea ni activa una versión.

### Siguiente trabajo dentro de las fases existentes

1. Revisar CI y la PR #16 con el SHA actual; el incremento aún no está integrado ni publicado.
2. Una vez aceptado el cierre de fase 4, avanzar a fase 5: informe reproducible, exportación y respaldo portable; decidir persistencia de archivos con evidencia y actualizar ADR-0003.
3. Mantener 0B/0C como investigación opcional; no bloquear R2 con Pyodide o Rust.

### Verificación del corte local de fase 4

Evidencia del incremento actual: `npm run typecheck`, `npm run lint` y `npm test`
pasaron; Vitest: 67/67. `npm run e2e -- --workers=1 e2e/pipelines.spec.ts`
pasó 32/32 en Chromium y Firefox contra Next.js local. Tras ampliar la prueba de
APPEND para quitar una fuente y comprobar que desaparecen sus vistas derivadas,
ese recorrido pasó 2/2 en Chromium/Firefox. `npm run build` generó el export
estático y `npm run smoke:static` pasó 47/47 en Chromium. El smoke detectó y se
ajustó una expectativa E2E desactualizada sobre el texto real del contexto de
proyecto. Estos cambios siguen fuera de la demo pública R1.

## Evidencia histórica del backlog 0A (E1–E2)

Los siguientes ítems se completaron al cerrar 0A. Se conservan para trazabilidad; ya no son trabajo abierto.

Los siguientes ítems están listos para convertirse en issues/PRs. Son identificadores de planificación local; **no se crearon issues en GitHub**.

| Ítem / entrega | Trabajo | Depende de | Evidencia para aceptar |
|---|---|---|---|
| **0A.1 / E1** | Inicializar candidato Next.js estático, TS strict, lockfile, lint, Vitest, Playwright y CI básica | — | Instalación reproducible; tipado/lint/build; smoke del sitio generado |
| **0A.2 / E1** | Adaptador DuckDB-Wasm/Worker, inicio diferido, contrato, cierre, errores y reinicio | 0A.1 | Integración real en navegador; abrir shell no inicializa motor; fallo y reinicio recuperables |
| **0A.3 / E1** | CSV → tabla → SQL → preview, con fixtures y estados de UI | 0A.2 | E2E importar/consultar/paginar; conteos/agregados esperados independientes; input malformado y nombres hostiles |
| **0A.4 / E2** | Evaluar XLSX nativo, integrar alternativa si hace falta y seleccionar hoja | 0A.3 | Resultado de ambas rutas aplicables registrado; tipos/fechas/hojas correctos; corrupción/expansión limitada |
| **0A.5 / E2** | Harness de benchmark, compatibilidad y límites | 0A.3 y 0A.4 | Datos brutos, al menos cinco ejecuciones, mediana/rango; equipo/navegador/versiones/bytes; fallos documentados |
| **0A.6 / E2** | Validar hosting estático, publicar demo y cerrar documentación de 0A | 0A.5 | Smoke sobre URL real, Worker/WASM operativos, ADR-0001 decidido, ADR-0002 tabular actualizado, README honesto |

Comprobar el build estático desde 0A.1 y ensayar hosting cuando funcione 0A.3 para detectar problemas pronto; **el cierre** de 0A.6 exige toda la evidencia previa.

El trabajo de 0A se entregó por cortes revisables. Para R2, cada cambio sigue registrando alcance, criterios satisfechos, pruebas realmente ejecutadas y limitaciones. No instalar dependencias adelantadas ni crear el árbol completo de módulos.

## Protocolo de validación y decisiones de corte

- **Correctitud:** fixtures pequeños con encabezados especiales, comillas, delimitadores, nulos, Unicode, fechas y números regionales; XLSX con varias hojas. Resultados esperados calculados fuera del adaptador que se prueba, con metodología registrada.
- **Rendimiento:** CSV 1k×10, 10k×20 y 100k×30; XLSX equivalente cuando sea viable. Mínimo cinco ejecuciones por escenario medido, separando frío/caliente. Registrar hardware, SO, navegador, motores, dimensiones, bytes reales, tiempos, memoria disponible y errores. Si una API no permite medir memoria, declararlo; no sustituirla por una cifra estimada sin identificarla.
- **Hipótesis del ADR-0002:** 10k×20 en menos de 5 s; 100k×30 en menos de 20 s; investigar incremento pico mayor a 1 GiB. No son promesas ni resultados obtenidos. Los 20 MB de CSV y 10 MB de XLSX siguen siendo orientativos hasta medir; el caso 100k×30 puede excederlos y debe etiquetarse como benchmark de investigación.
- **Respuesta de UI:** medir actividad del hilo principal durante importación; verificar controles y cancelación/recuperación. Una captura visual no prueba que el Worker evita bloqueos.
- **Privacidad:** inspeccionar tráfico durante importación/consulta y verificar que no salen contenidos de archivos. La carga de assets del sitio no implica procesamiento remoto ni garantiza funcionamiento offline.
- **Si Next.js complica Workers/WASM:** comparación acotada con Vite y decisión documentada antes de E3.
- **Si XLSX o los tamaños objetivo no son viables:** reducir límites o cambiar parser, volver a medir y explicar restricciones. No declarar cerrado 0A omitiendo XLSX.
- **Si el hosting o un navegador falla:** registrar el fallo, resolver o limitar soporte con evidencia. No presentar pruebas locales como certificación de Vercel.

CI crece con el producto: lint/tipado/build, contratos e integración de Worker/importadores en 0A; persistencia en E3; fixtures numéricos en E4–E6; E2E de los recorridos reales. Seguridad, teclado y errores se verifican en cada entrega, sin esperar a R5.

## Límites de estas primeras entregas

Quedan fuera de E1–E6: pipelines y JOIN/UNION, limpieza y exportación de datos transformados, Report Builder/proyectos portables, finanzas completas, conversiones/cotizaciones/IPC, plantillas especializadas de ventas/encuestas, Pyodide/Rust productivos, IA, autenticación, sincronización y conectores.

Los spikes 0B/0C se reconsideran después de 0A y no condicionan R1. No se aceptan como tarea necesaria para crear estadísticas descriptivas.

La persistencia de navegador puede perderse por limpieza/cuota/dispositivo. R1 debe explicarlo con claridad; el respaldo portable completo sigue en R2. No presentar Finanzas Lite como depósito único de registros irremplazables.

Los textos legales siguen siendo borradores no publicables. Preparar avisos sobre procesamiento local y almacenamiento que correspondan a la implementación; no presentar esos borradores como políticas vigentes. Licencia, URL y responsable/contacto deben resolverse para la publicación correspondiente, sin introducir cuentas ni servidor por ese motivo.

## Referencias y mantenimiento

Fuentes revisadas: [README](../README.md), [AGENTS](../AGENTS.md), [MVP](MVP.md), [roadmap](roadmap.md), [roadmap técnico](roadmap-tecnico.md), [arquitectura](architecture.md), [ADR](adr/README.md), [diseño](design/README.md), los tres PNG originales, [IA](ai-assistant.md), [autenticación](authentication.md), [integraciones](integrations.md) y borradores de [términos](legal/terms-of-use.md), [privacidad](legal/privacy-policy.md) y [avisos](legal/ai-financial-disclaimer.md).

Al cerrar un corte, actualizar su estado en este documento y la fase correspondiente en el roadmap, adjuntar evidencia reproducible y revisar el siguiente alcance. R1 está cerrado; la fase activa sigue siendo **4 (R2)** hasta completar los criterios de la fase y después avanzar a fase 5.

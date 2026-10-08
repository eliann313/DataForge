# ADR-0002 — Motores analíticos, intercambio de datos y criterios de corte

- **Estado:** Propuesto. Se cierra con los resultados de las fases 0A, 0B y 0C.
- **Fecha:** 2026-10-08
- **Relacionados:** [Arquitectura §5](../architecture.md), [Roadmap fase 0](../roadmap.md), [ADR-0001](./0001-framework-y-exportacion-estatica.md)

## Contexto

DataForge combina tres motores en el navegador: DuckDB-Wasm (datos tabulares), Pyodide (Python científico) y Rust/Wasm (algoritmos especializados). Cada motor tiene su propia memoria WebAssembly, tamaño de descarga y costo de arranque. La convivencia es una hipótesis, no un hecho comprobado.

## Hechos verificados

Consultados el 2026-10-08 en la documentación oficial. Las versiones cambian entre lanzamientos: se fijan en la fase 0B.

- **DuckDB-Wasm:** la página de extensiones lista `excel` entre las extensiones core de uso común, pero la describe como soporte de formatos de número tipo Excel. **No menciona ni confirma `read_xlsx` en Wasm.** La importación de XLSX requiere una prueba específica.
- **Pyodide:** la lista de paquetes incorporados incluye pandas, numpy, scipy, statsmodels, scikit-learn, pyarrow, polars y duckdb. **No incluye prophet.**

## Decisión provisional (hipótesis a validar)

| Motor | Rol | Condición de uso |
|---|---|---|
| **DuckDB-Wasm** | Dueño de los datos tabulares activos: importación, SQL, profiling, agregaciones, ELT | Siempre, en Worker |
| **Pyodide** | Estadística y modelos que justifiquen Python | Carga diferida; nunca en el arranque general |
| **Rust/Wasm** | DTW y distancias | Solo si supera con evidencia a la alternativa en TypeScript |
| **TypeScript + ECharts** | Orquestación, interfaz y gráficos | Siempre |

### Intercambio de datos

- Metadatos y parámetros: JSON tipado.
- Tablas: Arrow IPC u otro formato tipado, midiendo el costo real.
- Series numéricas: Typed Arrays.
- **No se asume zero-copy** entre memorias WebAssembly independientes.
- Se envían solo las columnas y filas necesarias, nunca el workspace completo.

### Importación de XLSX: dos rutas

- **Ruta A:** DuckDB-Wasm lee el archivo directamente, si la prueba lo confirma.
- **Ruta B:** un parser JavaScript especializado en un Worker transfiere los datos a DuckDB. Probablemente necesaria para hojas complejas; debe probarse su consumo de memoria, el tratamiento de tipos y la protección frente a ZIP/XML maliciosos.

Se mantienen ambas rutas hasta que las mediciones indiquen cuál adoptar, o si se combinan.

## Plan de medición

Cada resultado registra: equipo, sistema operativo, navegador y versión, versión de cada motor, tamaño real de los archivos y número de ejecuciones (mínimo cinco; se informan mediana y rango). Se distinguen arranque en frío, arranque en caliente y tiempo después de cargar paquetes.

### Umbrales provisionales

Son **hipótesis de investigación, no garantías de rendimiento**. Sirven para decidir si hacen falta optimizaciones, otro parser, límites más bajos o un cambio de arquitectura. Pueden ajustarse antes de aceptar este ADR.

| Prueba | Umbral provisional |
|---|---|
| CSV de 10.000 × 20 | Importación y vista previa en menos de 5 s |
| CSV de 100.000 × 30 | Importación y vista previa en menos de 20 s en el equipo de referencia |
| Memoria con 100.000 × 30 | Investigar si el incremento pico supera 1 GiB |
| Interfaz | Sin bloqueos perceptibles durante tareas pesadas |
| Pyodide | Medir arranque en frío y en caliente, y tras cargar paquetes |
| Rust/DTW | Correctitud frente a una referencia en TypeScript; tiempo y memoria **incluyendo transferencia e inicialización** |
| Despliegue | Build reproducible y ejecución en Vercel |
| Compatibilidad | Chromium y al menos otro navegador de escritorio; evaluación móvil por separado |

## Alternativas y criterios de descarte

- **Rust/Wasm:** si no mejora el algoritmo de forma significativa ni aporta otra ventaja, no será obligatorio para ese cálculo y se usa la implementación en TypeScript. Seguiría siendo válido como pieza de portfolio, pero se documenta como tal.
- **Pyodide:** si la latencia o el peso resultan excesivos, queda como función especializada de uso explícito y no parte del flujo habitual. Las estadísticas descriptivas y los baselines de pronóstico no deben depender de Pyodide si pueden resolverse con SQL o TypeScript.
- **DuckDB dentro de Pyodide:** se evalúa como alternativa si mantener dos runtimes con copias de datos resulta demasiado costoso. La lista de paquetes de Pyodide incluye `duckdb`, pero su comportamiento y consumo de memoria deben medirse.
- **XLSX:** si ninguna ruta cumple los umbrales, se reduce el límite inicial de tamaño y se informa claramente al usuario.

## DTW: caso de uso y alcance

Caso de uso a validar: encontrar series con forma temporal similar (por ejemplo productos, sucursales o categorías de gasto con curvas estacionales parecidas). Si no se confirma que resuelva una necesidad real del producto, el módulo se documenta como investigación y no como funcionalidad central.

La comparación incluye DTW exacto, ventana Sakoe-Chiba y, si corresponde, poda con cotas inferiores (como LB_Keogh), siempre contra una referencia independiente y con tolerancias explícitas.

## Algoritmos que aparecen en los mockups

Los mockups son referencias visuales y **no** un catálogo de algoritmos obligatorios. Prophet no está incorporado en Pyodide y no se implementará por figurar en una imagen. Random Forest está disponible mediante scikit-learn, pero su costo de carga y entrenamiento en el navegador debe medirse antes de planificarlo. Los pronósticos comienzan con modelos ingenuos y estacionales, métricas de error y validación temporal.

## Consecuencias

- Las fases 0A, 0B y 0C pueden cerrarse por separado; ninguna obliga a completar las demás.
- Este ADR se actualiza con los resultados medidos y pasa a **Aceptado** o **Modificado**.
- Los límites de capacidad del README se ajustan a lo medido.

## Referencias

- [DuckDB-Wasm: extensiones](https://duckdb.org/docs/current/clients/wasm/extensions)
- [Pyodide: paquetes incorporados](https://pyodide.org/en/stable/usage/packages-in-pyodide.html)

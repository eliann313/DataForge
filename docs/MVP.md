# DataForge — MVP y roadmap operativo

> **Estado:** planificación. Nada de lo descrito está implementado. Este documento acota qué se construye primero; el [roadmap](./roadmap.md) conserva la visión completa del producto.

**Principio:** no se reduce la visión, se reduce lo que se intenta construir al mismo tiempo. Cada etapa debe cerrarse con resultados observables antes de decidir la siguiente.

## 1. Objetivo del MVP (release R1)

Una aplicación pública, en español, sin cuenta, que permita:

1. **Importar un archivo real** (CSV y XLSX) y verlo en una tabla paginada/virtualizada.
2. **Procesarlo con DuckDB-Wasm** en un Worker y ejecutar consultas SQL reales.
3. **Explorar su calidad y estructura**: tipos, nulos, duplicados potenciales, rangos.
4. **Obtener estadística descriptiva y gráficos básicos** con resultados verificables.
5. **Registrar finanzas básicas a mano** (Finanzas Lite) y ver un resumen mensual.

Todo funciona localmente: los datos no salen del navegador.

## 2. Etapas

| Etapa | Contenido | Prioridad |
|---|---|---|
| **0A** | Next.js (o Vite, según [ADR-0001](./adr/0001-framework-y-exportacion-estatica.md)), TypeScript, DuckDB-Wasm, CSV/XLSX, Worker, vista previa, mediciones y despliegue estático | Inmediata |
| **0B – 0C** | Spikes acotados de Pyodide (0B) y Rust/Wasm (0C) | Investigación acotada, en paralelo o después de 0A |
| **1** | UI base, proyectos locales | Alta |
| **2** | Importación completa y Data Explorer | Alta |
| **3** | Estadística descriptiva y gráficos básicos | Alta |
| **3B** | **Finanzas Lite** | Alta |
| 4 – 5 | Pipelines, múltiples datasets, informes | Media |
| 6 – 7B | Finanzas completas, ventas y encuestas | Media |
| 8 – 10 | Python científico, series temporales, Rust/DTW, optimización | Posterior |
| IA | IA local, asistente y text-to-SQL controlado | Posterior |
| Futuro | Cuentas, Neon, BYOK, DataForge Connect, sincronización | Opcional |

La numeración de fases coincide con el [roadmap](./roadmap.md). El MVP abarca las etapas 0A a 3B: el release R1 corresponde a las fases 1–3B, construidas sobre 0A; 0B y 0C no lo bloquean.

## 3. Finanzas Lite

Primer caso de uso real, para demostrar temprano que DataForge no es solo una interfaz alrededor de un CSV.

**Incluye**
- Registro manual de ingresos y gastos: fecha, descripción, importe, moneda (ARS/USD), categoría y notas.
- Alta, edición y baja de movimientos.
- Proyecto local y persistencia en el navegador.
- Saldo por período y resumen mensual.
- Gráficos básicos (barras por categoría, evolución mensual).

**No incluye todavía**
- Cuentas, transferencias entre cuentas, pagos de tarjeta ni reintegros.
- Cotizaciones ARS/USD ni conversión entre monedas: cada moneda se muestra por separado, sin conversión implícita.
- Recurrencias, presupuestos, cuotas, predicciones.
- Importación bancaria con mapeo y detección de duplicados.
- Ajuste por inflación.

**Requisitos desde el primer día:** importes sin números de coma flotante binarios (decimal o unidades menores con reglas de redondeo explícitas) y totales verificados contra fixtures de referencia.

**Después:** [Finanzas completas](./roadmap.md) (fases 6–7) extienden esta base. El ajuste por inflación mediante IPC corresponde a Finanzas avanzadas; debe indicar fuente del IPC, período base y metodología, y distinguir valores nominales de ajustados.

## 4. Fuera del MVP

- Pipelines visuales, múltiples fuentes, JOIN/UNION e informes exportables.
- Pyodide, forecasting, Rust y DTW como funciones de producto.
- Asistente de IA, Chrome Built-in AI, text-to-SQL y BYOK.
- Autenticación, Neon, sincronización, DataForge Connect y API de ingesta.
- Plantillas de Ventas y Encuestas.

Siguen siendo parte de la visión y no se descartan; simplemente no condicionan las primeras versiones.

## 5. Reglas de ejecución

1. **Primero 0A.** No se agregan herramientas ni fases al roadmap antes de completar ese hito. La siguiente decisión surge de resultados técnicos observables.
2. Las mediciones siguen el protocolo del [ADR-0002](./adr/0002-motores-analiticos-y-criterios-de-corte.md): equipo, navegador, versiones, tamaños reales y varias ejecuciones.
3. Cada etapa se cierra con la *Definition of Done* del [roadmap](./roadmap.md#7-calidad-por-fase--definition-of-done).
4. Los límites de capacidad del README son hipótesis hasta que existan benchmarks.
5. Se mantiene la separación entre lo planificado y lo implementado en README y documentación.

## 6. Criterio de éxito de R1

- Un usuario nuevo importa un CSV o XLSX propio y obtiene estadísticas y un gráfico correctos sin crear una cuenta.
- Un usuario registra movimientos a mano y ve su resumen mensual tras recargar la página.
- Los resultados numéricos coinciden con las referencias independientes de los fixtures.
- Existe una demo pública y un informe de mediciones con límites reales.

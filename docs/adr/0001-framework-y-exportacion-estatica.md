# ADR-0001 — Framework de aplicación y exportación estática

- **Estado:** Propuesto. Se confirma o revierte al cerrar la [fase 0A](../roadmap.md).
- **Fecha:** 2026-10-08
- **Relacionados:** [Arquitectura §8](../architecture.md), [ADR-0002](./0002-motores-analiticos-y-criterios-de-corte.md)

## Contexto

DataForge es local-first: el análisis corre en el navegador mediante Web Workers y WebAssembly. El MVP es una aplicación estática (landing + workspace en el cliente). Cuentas, IA remota e ingesta externa son extensiones opcionales y posteriores; no deben condicionar la primera versión.

## Hechos verificados

Según la documentación oficial de Next.js (consultada el 2026-10-08), una exportación estática (`output: 'export'`) **no** admite, entre otras cosas: Headers, Redirects, Rewrites, Cookies, Server Actions, rutas dinámicas sin `generateStaticParams()`, Route Handlers que dependan de la solicitud ni Image Optimization con el loader por defecto.

Consecuencias directas para DataForge:

- Los headers HTTP que algunas funciones de WebAssembly requieren (COOP/COEP para memoria compartida o hilos) no pueden declararse en `next.config` con exportación estática. En Vercel se declararían en `vercel.json`; **esto debe comprobarse en el spike**.
- Las rutas a proyectos locales no pueden depender de IDs dinámicos prerenderizados; se usan parámetros de consulta o estado en el cliente (ya previsto en la arquitectura).
- Autenticación, Route Handlers de IA y API de ingesta obligarían a abandonar la exportación estática; por eso son posteriores y opcionales.

## Opciones

| Opción | Ventajas | Costos / riesgos |
|---|---|---|
| **A. Next.js con exportación estática** (candidato principal) | Landing prerenderizada, rutas y layouts, camino directo hacia cuentas y endpoints de IA si se aprueban | Limitaciones de la exportación estática; integración de Workers y assets WASM por comprobar |
| **B. Vite + React (SPA) para el workspace**, landing estática aparte si hace falta | Suele simplificar Workers y WASM en aplicaciones puramente cliente; sin limitaciones de servidor que no se usan | Hay que resolver rutas, layouts y landing por separado; migrar a servidor más adelante implica trabajo |
| **C. Next.js con servidor desde el inicio** | Sin restricciones de la exportación estática | Introduce runtime de servidor que el MVP no necesita; contradice el principio de no agregar infraestructura sin necesidad |

La opción C se descarta para el MVP.

## Decisión provisional

Mantener **A como candidato principal, no como decisión irrevocable**. En la fase 0A se implementa el spike mínimo (Worker con DuckDB-Wasm, importación de un archivo y vista previa) en A y, si el esfuerzo es acotado, también en B, para comparar con los mismos criterios.

COOP/COEP **no** se activan globalmente sin una necesidad demostrada: pueden afectar recursos de terceros y futuros flujos de autenticación.

## Criterios de evaluación

Se registran para cada opción, con versiones exactas:

1. Carga de Workers y assets WASM de DuckDB-Wasm sin soluciones alternativas invasivas.
2. Cantidad y complejidad de la configuración necesaria.
3. Tiempo de build, arranque en desarrollo y tamaño del bundle inicial.
4. Build reproducible y despliegue estático funcional en Vercel.
5. Navegación a proyectos locales sin IDs dinámicos prerenderizados.
6. Costo estimado de evolucionar hacia cuentas e IA remota, si se aprueban.

## Criterio de reconsideración

Si B resulta claramente más simple para los motores, sin perder ninguna funcionalidad necesaria del MVP, se adopta B para el workspace y se registra el cambio en este ADR. Si A exige soluciones alternativas que B no necesita, aplica el mismo criterio. La evidencia debe quedar escrita aquí; no se decide por preferencia.

## Consecuencias

- Hasta cerrar la fase 0A no se instalan dependencias específicas del framework más allá del spike.
- Este ADR se actualiza con los resultados y pasa a **Aceptado** o **Reemplazado**.

## Referencias

- [Next.js: static exports](https://nextjs.org/docs/app/guides/static-exports)

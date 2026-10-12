# Registro de decisiones de arquitectura (ADR)

Cada ADR documenta una decisión técnica con su contexto, alternativas y criterios para confirmarla o revertirla. Un ADR **no** implica que lo descrito esté implementado.

| ADR | Decisión | Estado |
|---|---|---|
| [0001](./0001-framework-y-exportacion-estatica.md) | Framework de aplicación y exportación estática (Next.js frente a Vite) | Aceptado — cerrado con la fase 0A |
| [0002](./0002-motores-analiticos-y-criterios-de-corte.md) | Motores analíticos, intercambio de datos y criterios de corte | Propuesto — tabular medido; se cierra con 0B y 0C |
| [0003](./0003-persistencia-opfs-diferido.md) | Persistencia local: IndexedDB en R1, OPFS diferido a R2 | Aceptado — cierra el punto de decisión de E3 |

## Estados

- **Propuesto:** decisión provisional; falta evidencia medida.
- **Aceptado:** respaldado por resultados registrados en el propio ADR.
- **Modificado / Reemplazado:** el ADR enlaza al que lo sustituye y conserva el historial.

## Formato

Contexto → hechos verificados (con fuente y fecha de consulta) → opciones → decisión → criterios de evaluación y descarte → consecuencias. Los resultados de mediciones se agregan al ADR con equipo, navegador, versiones y tamaños reales de archivo.

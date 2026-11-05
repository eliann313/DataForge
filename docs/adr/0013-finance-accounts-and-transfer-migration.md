# ADR-0013 — Cuentas financieras y migración local v2

- **Estado:** Aceptado para el primer corte de fase 6.
- **Fecha:** 2026-11-05.
- **Relacionados:** [ADR-0003](./0003-persistencia-opfs-diferido.md), [Arquitectura §7](../architecture.md).

## Contexto

Finanzas Lite almacenaba movimientos en IndexedDB v1 sin cuentas. Fase 6 necesita cuentas y transferencias propias sin perder los registros existentes ni contabilizar una transferencia como consumo o ingreso.

## Decisión

- Evolucionar `dataforge-finance` a esquema v2: conservar `transactions`, sumar `accounts` y migrar dentro del upgrade atómico.
- Crear cuentas iniciales ARS y USD; vincular movimientos anteriores según su moneda, preservando importe, fecha, descripción y categoría.
- Asociar cada nuevo movimiento a una cuenta. Una transferencia registra origen y destino, y requiere cuentas distintas de igual moneda.
- Calcular el saldo por cuenta con centavos enteros. Excluir transferencias de ingresos, gastos, gráficos por categoría y evolución consolidada.

## Consecuencias y alcance pendiente

El usuario conserva los movimientos financieros guardados por la versión anterior. Los datos siguen siendo locales a este navegador. Este corte no incluye importación bancaria, detección de duplicados, cotizaciones, pagos de tarjeta, reintegros ni presupuestos.

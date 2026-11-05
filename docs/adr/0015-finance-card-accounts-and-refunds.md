# ADR-0015 — Cuentas de tarjeta, pagos y reintegros enlazados

- **Estado:** Aceptado como modelo local para el siguiente corte de fase 6; sujeto a validación de producto antes del cierre de fase.
- **Fecha:** 2026-11-05.
- **Relacionados:** [ADR-0013](./0013-finance-accounts-and-transfer-migration.md), [ADR-0014](./0014-finance-local-file-import.md), [Roadmap fase 6](../roadmap.md).

## Contexto

El criterio de fase 6 exige representar compras y pagos de tarjeta sin contar dos veces el consumo, y reflejar reintegros asociados al gasto original. La base ya tiene cuentas bancarias y transferencias propias.

## Modelo y reglas

- Las cuentas declaran tipo `bank` o `card`; la migración IndexedDB v2→v3 asigna `bank` a las cuentas existentes.
- Una compra con tarjeta se guarda como `gasto` en la cuenta `card`; aumenta su deuda positiva.
- El pago de tarjeta se guarda como transferencia desde una cuenta `bank` hacia una cuenta `card`, de igual moneda. No altera ingresos ni gastos y reduce la deuda. No se modelan anticipos ni transferencias con origen en una tarjeta.
- Un reintegro es un movimiento separado, enlazado a un gasto de la misma cuenta y moneda. Admite abonos parciales hasta el saldo pendiente; reduce el saldo bancario disponible o la deuda de tarjeta y se informa por separado, no como ingreso.
- No se puede eliminar o cambiar un gasto si deja inválidos sus reintegros enlazados. Un reintegro sí puede editarse/eliminarse; su saldo pendiente se recalcula desde los movimientos persistidos.
- Los montos permanecen en centavos enteros. Las monedas no se convierten.

## Consecuencias y límites

El saldo de tarjeta se presenta como deuda positiva y no como efectivo disponible. Esta decisión es una interpretación reversible de los criterios del roadmap; no certifica un estado de cuenta ni contempla intereses, cuotas, límites, saldo inicial o conciliación bancaria. No se modelan reversos de reintegros ni contracargos fuera del reintegro enlazado.

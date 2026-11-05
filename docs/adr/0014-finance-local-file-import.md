# ADR-0014 — Importación local de movimientos financieros

- **Estado:** Aceptado para el segundo corte de fase 6.
- **Fecha:** 2026-11-05.
- **Relacionados:** [ADR-0013](./0013-finance-accounts-and-transfer-migration.md), [Arquitectura §7](../architecture.md), [Roadmap fase 6](../roadmap.md).

## Contexto

Finanzas ya asocia los movimientos con cuentas locales y conserva montos en centavos. La importación requiere poder mapear esquemas bancarios distintos sin enviar archivos a un servicio remoto y sin registrar parcialmente un lote inválido.

## Decisión

- Procesar archivos íntegramente en el navegador. Se reutiliza `read-excel-file` ya instalado para XLSX; CSV usa un parser local pequeño que respeta campos entrecomillados y delimitadores coma, punto y coma o tabulación.
- Admitir CSV UTF-8 y XLSX, únicamente la primera hoja del libro. El usuario asigna columnas distintas a fecha, descripción, tipo, importe y categoría; moneda y cuenta se seleccionan para todo el lote.
- Mostrar preview con filas válidas, posibles duplicados y errores. Ninguna fila se escribe hasta confirmar. Un lote con errores no se puede confirmar.
- Conservar el importe como entero de centavos mediante `parseAmount`; rechazar fechas y tipos no reconocidos.
- Detectar duplicados exactos por fecha, tipo, importe en centavos, moneda, cuenta y descripción sin distinguir mayúsculas. Marcar duplicados existentes o repetidos dentro del archivo y excluirlos del lote confirmado.
- Guardar el lote seleccionado mediante una operación `saveMany`: IndexedDB usa una transacción read-write única y `add`, por lo que una restricción o fallo de almacenamiento aborta toda la transacción.
- Limitar el archivo comprimido a 10 MiB y, antes de invocar el parser XLSX, validar el directorio ZIP con `assertSafeXlsxArchive`: máximo 64 MiB declarados de expansión total, 4096 entradas y rechazo de ZIP64/directorios ambiguos o malformados. Se aplican además topes de 100.000 filas y 100 columnas al contenido interpretado.

## Consecuencias y límites

El mapeo es explícito y no intenta inferir semántica de nombres de columnas. El tipo debe contener `ingreso`/`income`/`credit` o `gasto`/`egreso`/`expense`/`debit`; cada lote usa una sola moneda y cuenta. Los archivos XLS, XLSB, ODS, CSV no UTF-8, libros protegidos, hojas adicionales seleccionables, movimientos de transferencia, saldos de apertura, importes con moneda por fila y deduplicación aproximada quedan fuera. XLSX malformados se rechazan antes del parseo si falla el preflight ZIP, o por el parser si su estructura XLSX no es válida. Los topes declarados se verifican antes de descomprimir; no se amplían en esta decisión.

No se agregan dependencias ni backend. Los datos importados permanecen en la base `dataforge-finance` local del navegador.

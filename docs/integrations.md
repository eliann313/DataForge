# DataForge Connect — Integraciones de datos

> **Estado:** propuesta. Se distinguen **importación desde APIs** e **ingesta entrante**.

## 1. Fase 4B — Importar desde una API REST

- Obtener datos JSON/CSV mediante HTTP, paginación y mapeo explícito de campos a un DatasetSource.
- En navegador solo si la API permite CORS y no requiere exponer secretos.
- Con credenciales privadas o CORS incompatible, usar conectores backend autorizados y predefinidos.
- **No crear un proxy libre de URL**: implica SSRF y acceso potencial a redes internas. En cualquier proxy: listas de destinos, validación DNS/IP, restricción de redirecciones, tamaño, tiempo y formato.
- Inicialmente sincronización bajo demanda. Actualizaciones programadas requieren infraestructura/automatización con cuota.
- Respetar condiciones y límites del proveedor.

## 2. Cloud C3 — API para recepción externa

Permitir que GridHub WMS, ERP, e-commerce u otras aplicaciones envíen eventos/datasets a una fuente concreta, aun si el navegador de DataForge está cerrado.

Ejemplo **no implementado**:

```http
POST /api/v1/sources/{sourceId}/events
Authorization: Bearer df_live_<token>
Idempotency-Key: <unique-event-id>
Content-Type: application/json
```

```json
{
  "event_id": "evt_001",
  "schema_version": 1,
  "type": "inventory.snapshot",
  "occurred_at": "2026-10-08T12:00:00Z",
  "data": {"warehouse_id":"WH-01","sku":"PROD-100","quantity":250}
}
```

### Flujo

1. Identificar y autorizar clave para fuente/proyecto y scope `ingest:write`.
2. Validar tamaño, esquema, ID único/idempotencia y cuota.
3. Persistir el evento o manifiesto en bandeja pendiente; no ejecutar Python/Rust/DuckDB en backend.
4. Al abrir el proyecto, el usuario revisa y acepta importar.
5. DuckDB-Wasm procesa los datos localmente; se mantiene procedencia y versión.
6. Permitir descartar/eliminar, aplicar TTL y política de retención.

### Almacenamiento

- Neon: fuentes, permisos, manifests, contadores, metadatos y entradas pequeñas con límites.
- Objetos privados para archivos grandes; subir con URL temporal autorizada cuando corresponda.
- Expiración, limpieza, cuotas de bytes/eventos, límites de concurrencia y mecanismo de suspensión total.
- No almacenar archivos grandes en PostgreSQL ni prometer almacenamiento gratuito ilimitado.

### API keys de DataForge (distintas de BYOK de IA)

- Token opaco, aleatorio y de alta entropía; mostrar una sola vez.
- Guardar hash/digest verificable, **no** cifrado reversible.
- Asociar token a fuente, proyecto, propietario, permisos, caducidad y cuota.
- Rotación, revocación, trazas mínimas y control contra duplicación.
- Los secretos viven en el **backend** de GridHub o la otra aplicación, nunca en React público.
- Autorizar accesos servidor con referencia al propietario; nunca confiar en ID enviado por cliente.

## Criterios de aceptación

- Solicitudes sin clave/clave revocada/scope incorrecto son rechazadas.
- Reintentos idénticos no duplican movimientos o ventas.
- Ingestas persisten cuando no hay navegador abierto.
- Usuario puede revisar/importar/borrar, y se aplican límites de almacenamiento.
- Errores, cuotas, limpieza y aislamiento entre proyectos tienen tests.
- Antes de abrir uso externo: políticas de privacidad/retención, consentimiento y gestión de incidentes definidos.

**Nota:** esta capacidad no bloquea el uso anónimo, local o los releases R1–R5.

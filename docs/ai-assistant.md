# DataForge AI — Informes y chatbot analítico

> **Estado:** propuesta. El análisis matemático sigue siendo determinista; la IA interpreta métricas verificadas.

## 1. Capacidades

- Explicar métricas, tendencias y distribuciones.
- Señalar **aspectos para revisar**, no causas imaginadas.
- Construir resúmenes ejecutivos y secciones de informes.
- Chat contextual referenciado a métricas, gráficos, metodología y snapshots.
- Permitir edición y aprobación humana antes de incorporar conclusiones a reportes.

**Prohibiciones iniciales:** ejecutar código arbitrario, SQL destructivo, modificar datasets o inventar cifras. Los valores citados deben corresponder a `metricId` verificable.

## 2. Proveedores (adaptadores de un puerto AIProvider)

| Modo | Ejecución | Privacidad y dependencia |
|---|---|---|
| Reglas locales | Navegador, sin LLM | Predeterminado y siempre disponible |
| Chrome Built-in AI | Navegador/hardware compatible | Experimental; detección de soporte real |
| Vercel AI Gateway | Endpoint servidor de Next.js | Contexto enviado a proveedor con consentimiento |
| BYOK | Endpoint servidor o proveedor gestionado | Clave del usuario; condiciones externas |

**No pasar automáticamente de IA local a remota**. Si cambia destino de procesamiento, pedir permiso explícito. No habilitar envío de datasets íntegros por defecto.

Chrome Prompt/Summarizer y disponibilidad de español/hardware deben comprobarse en runtime; sin soporte, mostrar alternativa opcional. Modelos WebLLM/Gemma quedan en investigación por consumo de RAM, descarga y variabilidad del dispositivo.

## 3. Contexto y confianza

1. DataForge calcula resultados vía DuckDB/Python/Rust.
2. Context Builder crea JSON mínimo: snapshots, valores, unidades, fecha, tamaños muestrales, consultas, supuestos, referencias.
3. El usuario ve qué información se compartiría y acepta cada modalidad remota.
4. El proveedor recibe únicamente los datos seleccionados.
5. Salida JSON/stream validada con Zod; referencias a métricas controladas contra datos reales.
6. Mostrar por separado: dato calculado / interpretación generada / sugerencia / limitación.
7. Usuario edita y confirma contenido final.

El texto de archivos y etiquetas es **no confiable**: evitar prompt injection. No pasar datos personales financieros, encuestas identificables, salud o secretos a niveles gratuitos cuyo tratamiento no sea apropiado.

## 4. Credenciales y límites

**Global**: claves privadas en variables de entorno Vercel o autenticación OIDC compatible; jamás NEXT_PUBLIC_. Cuotas de app, rate limits, tokens máximos, simultaneidad, costo máximo y kill switch, además de presupuestos/alertas del Gateway.

**BYOK**: AES-256-GCM con IV único y tag; clave maestra privada del servidor, formato versionado, rotación; desencriptación solo con autorización. Usuario ve estado «clave configurada», jamás el secreto recuperado.

**API key de ingesta** no es BYOK: se guarda como hash por ser un token verificable y no recuperable.

En AI Gateway los budgets de plataforma no sustituyen límites de la aplicación y pueden no cubrir BYOK. Confirmar que los fallbacks no conviertan un fallo BYOK en consumo global no deseado. BYOK estricto puede requerir adaptadores directos de proveedor.

**Sin autenticación:** ofrecer demo/rules local; clave global compartida a usuarios anónimos solo si existen defensas reales contra abuso.

## 5. Persistencia y flujo técnico

- Historial de chat local por defecto; en cuenta, sincronización separada y optativa.
- Streaming mediante Route Handler; el workspace permanece CSR.
- No ejecutar toda la aplicación mediante SSR solo por habilitar IA remota.
- Logs mínimos; no registrar contenido de prompts ni API keys por defecto.
- Tratamiento de errores: no disponible, no soportado, límite de cuota, clave inválida, proveedor caído, consentimiento denegado.
- Salidas reproducibles parcialmente: conservar modelo, versión, fecha, prompt versionado, contexto autorizado y evidencias, **sin afirmar determinismo de LLM**.

## 6. Roadmap

- **Fase 5B-A:** informes deterministas y pruebas opcionales con Chrome Built-in AI + chatbot local donde esté disponible.
- **Fase 5B-B:** AI Gateway, informes asistidos, chatbot con streaming, BYOK, límites y consentimiento; requiere un entorno servidor.
- **Fase 5B-C (opcional):** herramientas de consulta controlada de solo lectura, búsqueda semántica o embeddings si justifican valor.

## 7. Aceptación

- Los cálculos no cambian por usar/no usar IA.
- Sin consentimiento no hay tráfico de contenido a LLM remoto.
- Referencias inválidas y números inventados son rechazados/etiquetados.
- La IA no puede alterar datasets.
- BYOK no se registra ni se devuelve al frontend.
- Cuotas impiden uso abusivo de clave global y se documentan costos.
- Chrome AI ausente no rompe la app.
- Test de contexto con información financiera/PII para validar minimización.

## Referencias

- [Vercel AI Gateway](https://vercel.com/docs/ai-gateway)
- [Vercel AI SDK](https://ai-sdk.dev/docs)
- [Chrome Built-in AI](https://developer.chrome.com/docs/ai/get-started)

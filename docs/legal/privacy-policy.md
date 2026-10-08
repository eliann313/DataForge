# Política de privacidad — BORRADOR NO PUBLICABLE

> **DOCUMENTO PRELIMINAR.** No publicar como política vigente antes de verificar implementación y completar responsable, jurisdicción y contacto. Las prácticas descritas son objetivos de diseño, no afirmaciones de procesamiento ya desplegado.

**Responsable:** [NOMBRE/ENTIDAD PENDIENTE]  
**Correo de privacidad:** [PENDIENTE]  
**Domicilio / país:** [PENDIENTE]  
**Vigencia:** [PENDIENTE]

## 1. Principio de minimización y privacidad local

DataForge está diseñada para procesar CSV, Excel, JSON, Parquet y datos manuales dentro del navegador. En modo local, el análisis sucede en el dispositivo con DuckDB-Wasm, Pyodide o Rust/Wasm. Los datos pueden guardarse en IndexedDB/OPFS y permanecer sujetos a cuotas y eliminación del navegador.

**No significa que toda la aplicación sea offline:** cargar el sitio o utilizar cotizaciones, autenticación, IA remota o integraciones requiere tráfico de red. Documentar cada tercero realmente utilizado.

## 2. Categorías de información previstas

- Datos de archivos que el usuario importe o escriba.
- Metadatos locales de proyectos, configuración y preferencias.
- Si existen cuentas: email, identificadores, sesiones, consentimientos y metadatos sincronizados.
- Si se habilitan API keys: identificadores y hashes de claves de integración; secretos BYOK cifrados.
- Datos técnicos y mínimos registros de seguridad indispensables; no registrar datasets o prompts por defecto.

**Finanzas personales y encuestas** pueden incluir datos sensibles o identificables. Aplicar minimización y restricciones adicionales.

## 3. Finalidades y bases legales

Definir para cada finalidad real: ejecución de funciones solicitadas, seguridad, soporte, almacenamiento remoto opcional y comunicaciones necesarias. Identificar la base jurídica aplicable (no asumir consentimiento como única base universal); registrar elecciones y revocación cuando correspondan.

## 4. Proveedores y transferencias

Lista prevista, solo al habilitar funciones:

- **Vercel:** hosting y, posteriormente, endpoints seguros.
- **Neon:** cuentas y metadatos conectados.
- **Servicio de correo transaccional:** registro y recuperación.
- **Vercel AI Gateway / proveedor de LLM:** contexto **expresamente autorizado** para IA remota.
- **Fuentes de cotización:** consultas de tipo de cambio.
- **Almacenamiento de objetos:** solo si se autoriza sincronización de archivos.

Antes de lanzamiento conectado: nombrar proveedores reales, países y condiciones de tratamiento/transferencias internacionales, conservación, procesamiento y acceso.

## 5. IA y consentimiento

Sin consentimiento para IA remota, no enviar contexto analítico a proveedores de modelos. Mostrar vista previa del contexto a transferir y advertir del tratamiento del proveedor y posibles límites del plan gratuito. No hacer fallback silencioso desde Chrome AI local a un LLM remoto. El chat local se guarda localmente por defecto. Las salidas pueden contener errores.

## 6. Conservación y eliminación

- **Local:** el usuario elimina proyectos o limpia los datos del sitio; la pérdida por limpieza del navegador es posible.
- **Cuenta:** permitir exportación, acceso, rectificación y eliminación donde corresponda, con plazos reales por documentar.
- **Ingresos externos:** definir plazo de retención y eliminación de bandeja; no conservar indefinidamente sin justificación.
- **Backups y logs:** detallar periodos efectivos antes del lanzamiento.

## 7. Seguridad

Medidas previstas: TLS, control de acceso por propietario, cookies seguras, tokens de corta duración, límites de abuso, cifrado AES-256-GCM para BYOK en reposo, digest seguro para API keys entrantes, secretos en servidor, segmentación local y validación de archivos.

La seguridad total no puede garantizarse: documentar contacto para incidentes y política real de respuesta.

## 8. Derechos de los titulares

Establecer proceso verificable para consultas, acceso, corrección, supresión y demás derechos aplicables. Identificar autoridad competente por país. Para Argentina, revisar Ley 25.326 y guías de la AAIP, además de condiciones de registro u obligaciones vigentes que correspondan.

## 9. Menores de edad

No ofrecer registro a menores de 18 años en el lanzamiento conectado según política propuesta, sujeto a revisión jurídica. No dirigir el producto a menores de 13 años ni recolectar deliberadamente información de menores. Definir procedimiento de contacto y eliminación ante detección.

## 10. Cookies, almacenamiento y analítica

Explicar tecnologías estrictamente necesarias y cualquier cookie/analítica adicional implementada. IndexedDB y OPFS no equivalen a cookies HTTP pero almacenan datos en el dispositivo. No afirmar que no existen cookies si el sistema de autenticación utiliza cookies de sesión.

## 11. Actualizaciones

Publicar versión, fecha y vía real para informar cambios materiales antes del lanzamiento.

**Pendiente obligatorio:** revisar prácticas de producción, responsables, bases legales, transferencias, derechos, datos sensibles, menor de edad, proveedores, conservación, contacto y seguridad. Este borrador no reemplaza asesoramiento jurídico.

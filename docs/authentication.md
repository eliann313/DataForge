# DataForge — Autenticación y cuentas

> **Estado:** planificación. Las cuentas son opcionales y quedan **fuera del [MVP](MVP.md)**. DataForge continúa funcionando sin registro y sin backend de análisis.

## Estrategia

- **Anónimo:** proyectos, carpetas, datasets, análisis e informes permanecen en el navegador (IndexedDB/OPFS), con respaldo exportable.
- **Conectado:** registro con email y contraseña, verificación, login, logout, restablecimiento de contraseña, sesiones, eliminación de cuenta y sincronización optativa.
- **Preferencia a evaluar:** Neon Auth; alternativa: Better Auth con Neon PostgreSQL y proveedor de correo transaccional.
- **Correo:** preferir un servicio gestionado o Resend/alternativa gratuita verificada. Nodemailer solo envía a través de SMTP: no provee por sí mismo un servidor de correo ni el sistema de recuperación. Puede requerirse remitente/dominio verificado, con costos o requisitos adicionales.
- **Nunca** implementar manualmente almacenamiento de contraseñas, tokens de recuperación ni gestión de sesiones si una biblioteca madura lo resuelve.

## Flujos y aceptación

1. **Registro:** email, contraseña, verificación de dirección y revisión de políticas vigentes; protección de abuso.
2. **Login:** sesiones gestionadas con cookies seguras, autorización del lado servidor, rate limits y respuestas no enumerables.
3. **Recuperación:** mensaje genérico; enlace/OTP de un uso con expiración y comprobación; notificación y revocación de sesiones cuando corresponda.
4. **Cuenta:** consultar y eliminar datos remotos, exportar información, gestionar secretos BYOK y cambiar credenciales.
5. **Migración:** preguntar qué proyecto local sincronizar; nunca subir datasets silenciosamente.
6. **Sin cuenta:** no bloquear ninguna funcionalidad analítica local.

Validar pruebas E2E de emails reales, expiración, abuso, acceso cruzado entre usuarios y borrado. No activar autenticación en producción antes de confirmar entrega de correos, DNS, cuotas, recuperabilidad y revisión legal.

## Edad mínima propuesta

**Cuentas conectadas: mayores de 18 años** como política de producto inicial, pendiente de revisión jurídica. No se orienta el producto a menores de 13 años ni se debe recolectar deliberadamente información personal de menores. El sitio público anónimo no verifica edad por sí mismo. Si más adelante se habilita a adolescentes, revisar consentimiento y regulación aplicable según jurisdicción.

## Diseño hexagonal

Puertos de aplicación sugeridos: `AuthPort`, `CloudProjectRepository`, `ConsentRepository`, `CredentialVault`. Adaptadores concretos del proveedor, no dependencias en el dominio.

**Neon:** cuentas, carpetas y metadatos. Los CSV/Excel/Parquet siguen locales salvo sincronización de archivos solicitada explícitamente; esta requerirá almacenamiento privado de objetos y autorización en servidor.

## Checklist de seguridad

- [ ] Contraseñas hasheadas por proveedor confiable; no texto plano ni cifrado reversible.
- [ ] Cookies HttpOnly/Secure/SameSite y protección CSRF donde corresponda.
- [ ] Comprobación del propietario de todo proyecto remoto; prevención de IDOR.
- [ ] Sin credenciales en variables `NEXT_PUBLIC_`, bundle, logs o respuestas.
- [ ] Antifuerza-bruta, rate limiting, auditoría minimizada.
- [ ] Recovery links de una sola utilización y corta duración.
- [ ] Borrado de cuenta, sesiones y tokens.
- [ ] Documentar retención y políticas antes de abrir registro.

## Documentación oficial

- [Better Auth: email/password](https://www.better-auth.com/docs/authentication/email-password)
- [Better Auth: envío de correo](https://www.better-auth.com/docs/concepts/email)
- [Resend: precios y cuotas](https://resend.com/pricing)
- [OWASP: autenticación](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP: recuperación](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)

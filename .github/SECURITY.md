# Política de seguridad

> DataForge es un proyecto educativo y de portfolio, local-first: los datos se
> procesan en el navegador y no hay backend analítico. Esto reduce la superficie
> de ataque, pero no la elimina (XSS vía archivos, inyección de fórmulas,
> dependencias).

## Versiones con soporte

| Rama | Soporte |
|---|---|
| `main` | Sí (último commit) |
| `develop` | Sí, best-effort (puede contener spikes en curso) |

No hay versiones publicadas ni LTS.

## Cómo reportar una vulnerabilidad

1. Usar **Private vulnerability reporting** de GitHub
   (pestaña *Security > Report a vulnerability*). **No abrir un issue público.**
2. Incluir: descripción, impacto, pasos de reproducción, navegador/versión y,
   si aplica, archivo de prueba mínimo.

Responderemos best-effort; al ser un proyecto unipersonal sin SLA, no se
garantizan tiempos. Publicaremos el fix y el crédito correspondiente salvo que
se pida anonimato.

## Alcance de interés

- XSS/HTML inseguro en informes y tablas, inyección de fórmulas CSV,
  composición SQL, archivos malformados (ZIP/XML), dependencias vulnerables.
- Queda fuera: ingeniería social, cuentas o nube (no existen en el MVP).

Ver también las reglas de seguridad en [AGENTS.md](../AGENTS.md#5-seguridad).

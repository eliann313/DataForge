# DataForge — Guía visual y mockups

> **Estado:** referencias de diseño, no capturas de una aplicación implementada ni especificaciones pixel-perfect.

## Mockup versionado en GitHub

![Referencia vectorial del workspace](./workspace-reference.svg)

**Archivo:** [workspace-reference.svg](./workspace-reference.svg).

Este SVG es una **guía vectorial creada para el repositorio**, coherente con los conceptos de las tres composiciones iniciales generadas durante planificación. Las **tres composiciones PNG originales ya están versionadas** en [`mockups/`](./mockups/README.md), donde se muestran con sus nombres originales y sus descripciones. Son mockups generados, **no capturas de una aplicación implementada**.

## Galería de conceptos originales

[Ver los tres PNG y la guía de implementación](./mockups/README.md).

## Dirección visual aprobada

- **Barra lateral oscura**, marca DataForge y navegación breve: Inicio, Datos, Análisis, Transformaciones, Laboratorio e Informes.
- **Panel de trabajo claro**, tipografía limpia, tarjetas de indicadores y tableros con alta densidad informativa controlada.
- **Acentos azul/violeta**, superficies neutras, colores semánticos de error, éxito y advertencia.
- **Inspector contextual** a la derecha, que muestra parámetros del gráfico, dataset, pipeline o informe seleccionado.
- **Progresión de complejidad:** acciones simples al entrar; herramientas técnicas en el laboratorio, no todas visibles de inicio.
- **Inicio con dos accesos:** «Analizar mis datos» y «Probar un ejemplo».
- **Plantillas:** Finanzas, Ventas, Encuestas y análisis libre, todas sobre el mismo workspace.
- **Tema claro de inicio**; futuro tema oscuro sin cambios de arquitectura.
- **Español solamente**, números localizados; distinción entre ARS y USD en datos monetarios.
- **Responsive:** adaptar layout, permitir desplazamiento accesible de tablas y convertir inspector en drawer en pantallas chicas.

## Pantallas que se derivan del concepto

1. Landing pública con CTA para prueba sin registro.
2. Inicio con proyectos/carpetas y datasets de demo.
3. Importación por drag-and-drop; CSV/Excel/JSON/Parquet.
4. Explorador tabular, schema, tipado semántico y profiling.
5. Dashboard analítico con métricas y configurador de visualizaciones.
6. Transformaciones como lista de pasos y luego canvas tipo nodo.
7. Laboratorio: SQL, estadísticas científicas y time series.
8. Report Builder con editor y vista previa.
9. Finanzas con dashboard y registro manual de movimientos.
10. Asistente IA como panel contextual optativo.

## Stack de diseño propuesto

Tailwind CSS, shadcn/ui, Lucide React, TanStack Table/Virtual, Apache ECharts y React Flow en la fase correspondiente. Tokens CSS para colores, radios, sombras, espaciado y tipografía; evitar estilos ad hoc duplicados.

## Accesibilidad y precisión

- No usar el color como único canal de significado.
- Contraste, focus visible, control de teclado y labels en formularios.
- Vistas alternativas tabulares para cifras importantes.
- No usar gráficos demo con números inventados sin la etiqueta «Datos de ejemplo».
- Las imágenes generadas pueden contener textos o elementos inconsistentes: **son inspiración, no especificaciones funcionales ni assets finales de UI**.

## Criterios de aceptación UX

- Navegación y contexto del proyecto persistentes entre módulos.
- Respuesta de acciones de importación/análisis asíncronas con progreso/error y recuperación.
- Carga inicial sin inicializar Pyodide y Rust.
- Diseño consistente en las vistas implementadas.
- Experiencia usable sin cuenta y sin IA.

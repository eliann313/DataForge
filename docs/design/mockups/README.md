# DataForge — Mockups originales de UI/UX

> **Estado:** referencias visuales de planificación. **Los tres PNG originales ya están versionados en este directorio.** No representan pantallas implementadas ni diseños pixel-perfect.

Estos mockups definen la **dirección visual objetivo** de DataForge: navegación lateral oscura, workspace claro, tarjetas de indicadores, tablas de datos, gráficos interactivos, módulos especializados y paneles de configuración. La implementación real deberá preservar su coherencia visual con mejoras de accesibilidad, tipografía y responsive.

## Concepto 1 — Flujo completo del producto

![Mockup 1: landing, importación, exploración, calidad, análisis, visualizaciones, pipelines, series temporales e informes](./a_wide_clean_dark_light_modern_ui_mockup_collage.png)

[Ver PNG original 1](./a_wide_clean_dark_light_modern_ui_mockup_collage.png)

**Enfoque:** recorrido del usuario desde la landing hasta la generación del informe, pasando por carga de archivos, perfiles de calidad, insights, visualizaciones y transformaciones.

## Concepto 2 — Módulos del workspace

![Mockup 2: inicio, importación, exploración, gráficos, predicciones, informes, SQL y proyectos](./a_wide_clean_modern_ui_ux_mockup_collage_of_a_da.png)

[Ver PNG original 2](./a_wide_clean_modern_ui_ux_mockup_collage_of_a_da.png)

**Enfoque:** consistencia visual entre Inicio, importación, Data Explorer, visualizaciones, análisis temporal, capacidades avanzadas, Report Builder, SQL y gestión de proyectos.

## Concepto 3 — Dashboard y experiencia analítica

![Mockup 3: inicio, carga de datos, perfilado, análisis exploratorio, pipelines, series temporales, SQL e informes](./a_wide_clean_ui_ux_mockup_collage_on_a_dark_to_li.png)

[Ver PNG original 3](./a_wide_clean_ui_ux_mockup_collage_on_a_dark_to_li.png)

**Enfoque:** composición refinada de dashboards con sidebar oscura, superficies claras, widgets con KPIs, gráficos, pasos de pipeline e informes.

---

## Archivos originales

| Referencia | Archivo |
|---|---|
| Concepto 1 — Flujo del producto | [PNG 1](./a_wide_clean_dark_light_modern_ui_mockup_collage.png) |
| Concepto 2 — Módulos y navegación | [PNG 2](./a_wide_clean_modern_ui_ux_mockup_collage_of_a_da.png) |
| Concepto 3 — Workspace y dashboards | [PNG 3](./a_wide_clean_ui_ux_mockup_collage_on_a_dark_to_li.png) |

Se conservan **los nombres originales** para evitar duplicados y enlaces rotos. No son las imágenes renombradas `concept-01-workflow.png`, `concept-02-modules.png` y `concept-03-workspace.png` mencionadas en un borrador anterior.

## Guía para implementación con agentes

1. **Usar estas imágenes como referencia visual**, no como especificación exacta de layout ni fuente de lógica de negocio.
2. Mantener colores, ritmo visual, sidebar, tarjetas y panel contextual consistentes; reutilizar componentes de **Tailwind CSS + shadcn/ui + Lucide React**.
3. Usar **TanStack Table/Virtual** para tablas y **Apache ECharts** para gráficos; integrar React Flow cuando corresponda a la fase de pipelines.
4. Diseñar primero la navegación y el workspace que exige la fase activa. No implementar funcionalidades de las fases posteriores solo porque aparecen en la imagen.
5. Verificar **español, contraste, teclado, estados vacíos y errores, ancho responsive y visualización de datos reales**.
6. Considerar los números y textos dentro de los mockups como **ficticios**. La UI real obtiene valores de las operaciones verificadas de DataForge.
7. El módulo financiero necesitará pantallas adicionales (movimientos manuales, cuentas, presupuestos) y el chatbot de IA será contextual y opcional; estos PNG no los agotan.
8. Reemplazar estos conceptos por capturas reales solo cuando haya implementación verificable; preservar estas referencias históricas.

## Documentación relacionada

- [Guía de UI y diseño](../README.md)
- [Referencia vectorial adicional](../workspace-reference.svg)
- [Arquitectura](../../architecture.md)
- [Roadmap](../../roadmap.md)
- [README principal](../../../README.md)

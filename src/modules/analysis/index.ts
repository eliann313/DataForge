// API pública del módulo analysis (E5): servicios analíticos y resultados
// tipados sobre el motor general. Sin jerarquía hexagonal completa.
export {
  evaluateFindings,
  type Finding,
  type FindingInput,
  type FindingRule,
} from "./findings";

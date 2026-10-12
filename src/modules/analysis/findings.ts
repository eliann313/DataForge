// Hallazgos por reglas transparentes (E5): cada regla documenta su umbral
// y la evidencia que la dispara. Distinguen hecho calculado de interpretación:
// nunca atribuyen causalidad. Sin dependencias técnicas.
export type FindingRule =
  | "nulos-altos"
  | "categoria-dominante"
  | "asimetria"
  | "constante";

export interface FindingInput {
  column: string;
  total: number;
  nullPct: number;
  distinct: number;
  mean?: number | null;
  median?: number | null;
  stddev?: number | null;
  /** Participación de la categoría más frecuente (0–100). */
  topShare?: number | null;
}

export interface Finding {
  rule: FindingRule;
  column: string;
  text: string;
}

export function evaluateFindings(inputs: FindingInput[]): Finding[] {
  const out: Finding[] = [];
  for (const input of inputs) {
    if (input.nullPct > 20) {
      out.push({
        rule: "nulos-altos",
        column: input.column,
        text: `${input.column} tiene ${input.nullPct} % de nulos (umbral 20 %): revise si la ausencia es significativa antes de filtrar.`,
      });
    }
    if (input.topShare !== null && input.topShare !== undefined && input.topShare > 50) {
      out.push({
        rule: "categoria-dominante",
        column: input.column,
        text: `Una categoría concentra el ${input.topShare} % de ${input.column} (umbral 50 %): los promedios globales la reflejan sobre todo a ella.`,
      });
    }
    if (
      input.mean !== null &&
      input.mean !== undefined &&
      input.median !== null &&
      input.median !== undefined &&
      input.stddev !== null &&
      input.stddev !== undefined &&
      input.stddev > 0 &&
      Math.abs(input.mean - input.median) / input.stddev > 0.5
    ) {
      out.push({
        rule: "asimetria",
        column: input.column,
        text: `${input.column} es asimétrica (|media − mediana|/desvío > 0,5): prefiera la mediana como centro.`,
      });
    }
    if (input.total > 0 && input.distinct <= 1) {
      out.push({
        rule: "constante",
        column: input.column,
        text: `${input.column} es constante (un solo valor): no aporta para comparar ni graficar.`,
      });
    }
  }
  return out;
}

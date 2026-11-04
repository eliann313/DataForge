import { expect, it } from "vitest";
import { tryNumericSummary } from "./numeric-summary";

it("conserva el error del resumen sin rechazar la carga del dataset", async () => {
  const result = await tryNumericSummary("importe", async () => { throw new Error("Precisión no representable"); });
  expect(result).toEqual({ numeric: null, numericError: "Precisión no representable" });
  expect(await tryNumericSummary("", async () => { throw new Error("no debe llamarse"); })).toEqual({ numeric: null, numericError: null });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_XLSX_UNCOMPRESSED_BYTES } from "../../../platform/engines/duckdb/csv";

const reader = vi.hoisted(() => vi.fn());
vi.mock("read-excel-file/browser", () => ({ readSheet: reader }));

import { readFinanceFile } from "./import-file";

describe("lectura de archivos financieros", () => {
  afterEach(() => reader.mockReset());

  it("rechaza una expansión XLSX declarada sobre 64 MiB antes de invocar el parser", async () => {
    const buffer = new ArrayBuffer(98);
    const view = new DataView(buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint32(30, 0x02014b50, true);
    view.setUint16(40, 8, true);
    view.setUint32(50, 1, true);
    view.setUint32(54, MAX_XLSX_UNCOMPRESSED_BYTES + 1, true);
    view.setUint16(84, 1, true); view.setUint16(86, 1, true);
    view.setUint32(88, 46, true); view.setUint32(92, 30, true);
    view.setUint32(76, 0x06054b50, true);
    view.setUint16(84, 1, true); view.setUint16(86, 1, true);
    view.setUint32(88, 46, true); view.setUint32(92, 30, true);
    const file = new File([buffer], "hostil.xlsx");

    await expect(readFinanceFile(file)).rejects.toThrow(/límite de expansión de 64 MiB/);
    expect(reader).not.toHaveBeenCalled();
  });
});

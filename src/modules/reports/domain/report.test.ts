import { describe, expect, it } from "vitest";
import { createReport, isReport, renderReportHtml, updateReport, type ReportSnapshotView } from "./report";

const snapshot: ReportSnapshotView = {
  id: "snapshot-1",
  title: "Resumen <ventas>",
  createdAt: "2026-11-04T12:00:00.000Z",
  source: { datasetName: "<script>alert(1)</script>", rowCount: 2, versionId: "v1", columns: [{ name: "<img>", type: "VARCHAR" }] },
  parameters: { column: "<svg onload=alert(1)>" },
  results: { description: { mean: 3 }, findings: ["dato & texto"] },
};

describe("reports", () => {
  it("creates, validates and updates report metadata without mutating the source", () => {
    const report = createReport("p1", "Informe", "2026-11-04T12:00:00.000Z");
    const updated = updateReport(report, {
      title: "Informe mensual",
      sections: [{ id: "s1", kind: "observations", title: "Observaciones", content: "Texto propio" }],
    }, "2026-11-04T12:01:00.000Z");
    expect(isReport(updated)).toBe(true);
    expect(updated.title).toBe("Informe mensual");
    expect(report.sections).toEqual([]);
    expect(() => createReport("p1", " ")).toThrow("título");
  });

  it("rejects imported or corrupted definitions that exceed size and section limits", () => {
    const report = createReport("p1", "Informe");
    expect(isReport({ ...report, sections: Array.from({ length: 101 }, (_, index) => ({
      id: String(index), kind: "observations", title: "Notas", content: "",
    })) })).toBe(false);
    expect(isReport({ ...report, sections: [{
      id: "large", kind: "observations", title: "Notas", content: "x".repeat(100_001),
    }] })).toBe(false);
  });

  it("escapes snapshot and editorial text in standalone HTML and reports missing references", () => {
    const report = createReport("p1", "<script>título</script>", "2026-11-04T12:00:00.000Z");
    report.sections = [
      { id: "a", kind: "snapshot", title: "Evidencia", snapshotId: snapshot.id },
      { id: "b", kind: "conclusions", title: "Conclusiones", content: "<iframe src=\"https://evil\">" },
      { id: "c", kind: "snapshot", title: "Perdido", snapshotId: "deleted" },
    ];
    const html = renderReportHtml(report, new Map([[snapshot.id, snapshot]]));
    expect(html).toContain("&lt;script&gt;título");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;svg onload=alert(1)&gt;");
    expect(html).toContain("&lt;iframe src=&quot;https://evil&quot;&gt;");
    expect(html).toContain("no está disponible en este proyecto");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<iframe");
  });

  it("limits HTML export size instead of creating an oversized local file", () => {
    const report = createReport("p1", "Grande");
    const largeSnapshot = (id: string): ReportSnapshotView => ({
      ...snapshot,
      id,
      source: { ...snapshot.source, datasetName: "dataset" },
      parameters: {},
      results: { description: "x".repeat(1_800_000) },
    });
    const snapshots = new Map(["a", "b", "c"].map((id) => [id, largeSnapshot(id)]));
    report.sections = [...snapshots.keys()].map((id) => ({ id, kind: "snapshot", title: id, snapshotId: id }));
    expect(() => renderReportHtml(report, snapshots)).toThrow("límite de 5 MiB");
  });
});

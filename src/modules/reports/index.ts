export {
  createReport,
  escapeHtml,
  isReport,
  renderReportHtml,
  updateReport,
  type Report,
  type ReportSection,
  type ReportSectionKind,
  type ReportSnapshotView,
} from "./domain/report";
export type { ReportRepository, ReportSnapshotReader } from "./application/ports";
export { IndexedDBReportRepository } from "./infrastructure/indexeddb";
export { default as ReportsView } from "./presentation/ReportsView";

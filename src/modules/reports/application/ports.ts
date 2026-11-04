import type { Report } from "../domain/report";

export interface ReportRepository {
  list(projectId: string): Promise<Report[]>;
  save(report: Report): Promise<void>;
  delete(projectId: string, reportId: string): Promise<void>;
}

export interface ReportSnapshotReader<Snapshot = unknown> {
  list(projectId: string): Promise<Snapshot[]>;
  findById(projectId: string, snapshotId: string): Promise<Snapshot | null>;
}

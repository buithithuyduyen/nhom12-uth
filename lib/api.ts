/**
 * Tiện ích cho route handlers (server).
 */

import type { Shipment } from "@/lib/types";

export function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function isValidId(id: string): boolean {
  return /^[a-zA-Z0-9-]{1,80}$/.test(id);
}

export interface ShipmentSummary {
  id: string;
  voyageName: string;
  status: Shipment["status"];
  createdAt: string;
  updatedAt: string;
  fileCount: number;
  discrepancyCount: number;
  lastExport: string | null;
}

export function summarize(s: Shipment): ShipmentSummary {
  return {
    id: s.id,
    voyageName: s.voyageName,
    status: s.status,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    fileCount: s.files.filter((f) => !f.duplicateOf).length,
    discrepancyCount: s.discrepancies.filter((d) => d.resolvedValue === undefined).length,
    lastExport: s.exports.length ? s.exports[s.exports.length - 1].fileName : null,
  };
}

export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

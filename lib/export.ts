/**
 * lib/export.ts (server)
 *
 * Tạo file Excel kết quả từ dữ liệu chuyến tàu, lưu bản sao + manifest vào ./data/exports.
 */

import crypto from "crypto";
import type { SheetsData } from "@/lib/types";
import { getStorage, mutateShipment, paths } from "@/lib/storage";
import { getCodeTables, getDefaultTemplateId, getTemplateBuffer } from "@/lib/templates";
import { patchWorkbook, type WrittenCell } from "@/lib/excel/patch-xlsx";

export interface ExportManifest {
  exportId: string;
  fileName: string;
  createdAt: string;
  shipmentId: string | null;
  templateId: string;
  written: WrittenCell[];
  clearedRanges: Array<{ sheet: string; range: string }>;
  warnings: string[];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function safeFileBase(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return base || "ChuyenTau";
}

export function buildExportFileName(voyageName: string, date = new Date()): string {
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `${safeFileBase(voyageName)}_NSW_${stamp}.xlsx`;
}

export async function createExport(input: { shipmentId: string | null; voyageName: string; sheets: SheetsData; templateId?: string | null }): Promise<{ fileName: string; buffer: Buffer; manifest: ExportManifest }> {
  const templateId = input.templateId || (await getDefaultTemplateId());
  const template = await getTemplateBuffer(templateId);
  const codes = await getCodeTables(templateId).catch(() => null);
  const result = await patchWorkbook(template, input.sheets, codes);

  const storage = getStorage();
  let fileName = buildExportFileName(input.voyageName);
  // tránh trùng tên trong cùng phút
  let counter = 1;
  while (await storage.exists(paths.exportFile(fileName))) {
    counter++;
    fileName = fileName.replace(/(_\d+)?\.xlsx$/, `_${counter}.xlsx`);
  }

  const manifest: ExportManifest = {
    exportId: crypto.randomUUID(),
    fileName,
    createdAt: new Date().toISOString(),
    shipmentId: input.shipmentId,
    templateId,
    written: result.written,
    clearedRanges: result.clearedRanges,
    warnings: result.warnings,
  };
  await storage.saveFile(paths.exportFile(fileName), result.buffer);
  await storage.saveFile(paths.exportManifest(fileName), JSON.stringify(manifest, null, 2));

  if (input.shipmentId) {
    await mutateShipment(input.shipmentId, (s) => ({
      ...s,
      status: "exported",
      exports: [...s.exports, { exportId: manifest.exportId, fileName, createdAt: manifest.createdAt }],
    }));
  }
  return { fileName, buffer: result.buffer, manifest };
}

/**
 * lib/pipeline.ts (server)
 *
 * Điều phối: tạo chuyến tàu, nhận file upload (tách trang), chạy bóc tách nền theo từng trang,
 * tổng hợp N-1 + đối chiếu chéo, lưu vào ./data/shipments/<id>.json.
 */

import crypto from "crypto";
import type { ExtractedInstance, FileRecord, PageInfo, Shipment } from "@/lib/types";
import { getShipmentRepo, getStorage, mutateShipment, paths } from "@/lib/storage";
import { getCodeTables, getDefaultTemplateId } from "@/lib/templates";
import { loadPorts, loadSettings } from "@/lib/server-data";
import { aggregate, autoSelectActive, initialSheets, type AggregateContext } from "@/lib/aggregate";
import { crosscheck } from "@/lib/crosscheck";
import { isSupportedExtension, loadPageText, readDocument } from "@/lib/extraction/read";
import { loadPageImageForModel } from "@/lib/extraction/read/pdf";
import { rotateStoredPage } from "@/lib/extraction/read/image";
import { ocrImage } from "@/lib/extraction/read/ocr";
import { isOcrEnabled } from "@/lib/mode";
import { classifyInstance } from "@/lib/extraction/classify";
import { extractInstance } from "@/lib/extraction/extract";
import { getLlmConfig, missingKeyMessage } from "@/lib/extraction/llm";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_FILES_PER_SHIPMENT = 15;

export async function buildContext(templateId: string): Promise<AggregateContext> {
  const [codes, ports, settings] = await Promise.all([getCodeTables(templateId).catch(() => null), loadPorts(), loadSettings()]);
  return { codes, ports: ports.ports, settings };
}

export async function createShipment(voyageName?: string): Promise<Shipment> {
  const templateId = await getDefaultTemplateId();
  return getShipmentRepo().create({
    voyageName: voyageName?.trim() || "Chuyến tàu mới",
    status: "draft",
    templateId,
    files: [],
    extractedData: { instances: [], sheets: initialSheets() },
    discrepancies: [],
    resolvedValues: {},
    exports: [],
  });
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

export interface IncomingFile {
  name: string;
  buffer: Buffer;
}

export interface UploadOutcome {
  fileName: string;
  ok: boolean;
  message?: string;
  duplicate?: boolean;
}

export async function addFiles(shipmentId: string, incoming: IncomingFile[]): Promise<{ shipment: Shipment; outcomes: UploadOutcome[] }> {
  const repo = getShipmentRepo();
  const current = await repo.get(shipmentId);
  if (!current) throw new Error("Không tìm thấy chuyến tàu");
  const outcomes: UploadOutcome[] = [];
  const newRecords: FileRecord[] = [];
  const storage = getStorage();
  let count = current.files.length;

  for (const file of incoming) {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (!isSupportedExtension(ext)) {
      outcomes.push({ fileName: file.name, ok: false, message: "Chỉ nhận PDF, DOCX, PNG, JPG" });
      continue;
    }
    if (file.buffer.length > MAX_FILE_BYTES) {
      outcomes.push({ fileName: file.name, ok: false, message: "File vượt quá 25 MB" });
      continue;
    }
    if (count >= MAX_FILES_PER_SHIPMENT) {
      outcomes.push({ fileName: file.name, ok: false, message: `Tối đa ${MAX_FILES_PER_SHIPMENT} file mỗi chuyến` });
      continue;
    }
    const sha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
    const fileId = crypto.randomUUID();
    const original = [...current.files, ...newRecords].find((f) => f.sha256 === sha256 && !f.duplicateOf);
    await storage.saveFile(paths.upload(shipmentId, fileId, ext), file.buffer);
    const record: FileRecord = {
      fileId,
      fileName: file.name,
      ext,
      size: file.buffer.length,
      sha256,
      uploadedAt: new Date().toISOString(),
      pages: [],
    };
    if (original) {
      record.duplicateOf = original.fileId;
      newRecords.push(record);
      count++;
      outcomes.push({ fileName: file.name, ok: true, duplicate: true, message: `Trùng file với "${original.fileName}" – chỉ xử lý một bản` });
      continue;
    }
    try {
      const instances = await readDocument({ shipmentId, fileId, fileName: file.name, ext, buffer: file.buffer, sha256 });
      record.pages = instances.map(
        (i): PageInfo => ({
          page: i.page,
          kind: i.kind,
          title: i.title,
          docType: null,
          mode: null,
          port: null,
          date: null,
          voyageNo: null,
          rotation: 0,
          active: true,
          status: "pending",
          hasImage: i.hasImage,
          hasHtml: i.hasHtml,
        }),
      );
      newRecords.push(record);
      count++;
      outcomes.push({ fileName: file.name, ok: true });
    } catch (err) {
      await storage.deleteFile(paths.upload(shipmentId, fileId, ext));
      outcomes.push({ fileName: file.name, ok: false, message: `Không đọc được file: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  const shipment = await mutateShipment(shipmentId, (s) => ({ ...s, files: [...s.files, ...newRecords] }));
  return { shipment, outcomes };
}

export async function removeFile(shipmentId: string, fileId: string): Promise<Shipment> {
  const storage = getStorage();
  const shipment = await mutateShipment(shipmentId, async (s) => {
    const file = s.files.find((f) => f.fileId === fileId);
    if (!file) return s;
    await storage.deleteFile(paths.upload(shipmentId, fileId, file.ext));
    for (const p of file.pages) {
      await storage.deleteFile(paths.pageImage(shipmentId, fileId, p.page));
      await storage.deleteFile(paths.pageHtml(shipmentId, fileId, p.page));
      await storage.deleteFile(paths.pageText(shipmentId, fileId, p.page));
      await storage.deleteFile(paths.pageItems(shipmentId, fileId, p.page));
    }
    // Nếu file bị xóa là bản gốc của file trùng -> bản trùng đầu tiên trở thành bản gốc (cần đọc lại)
    const files = s.files
      .filter((f) => f.fileId !== fileId)
      .map((f) => (f.duplicateOf === fileId ? { ...f, duplicateOf: undefined } : f));
    return { ...s, files, extractedData: { ...s.extractedData, instances: s.extractedData.instances.filter((i) => i.fileId !== fileId) } };
  });
  // Bản trùng được "thăng cấp" chưa có trang -> đọc lại
  for (const f of shipment.files.filter((x) => x.pages.length === 0 && !x.duplicateOf)) {
    const buffer = await storage.readFile(paths.upload(shipmentId, f.fileId, f.ext));
    const instances = await readDocument({ shipmentId, fileId: f.fileId, fileName: f.fileName, ext: f.ext, buffer, sha256: f.sha256 });
    await mutateShipment(shipmentId, (s) => ({
      ...s,
      files: s.files.map((x) =>
        x.fileId === f.fileId
          ? {
              ...x,
              pages: instances.map((i) => ({
                page: i.page,
                kind: i.kind,
                title: i.title,
                docType: null,
                mode: null,
                port: null,
                date: null,
                voyageNo: null,
                rotation: 0,
                active: true,
                status: "pending" as const,
                hasImage: i.hasImage,
                hasHtml: i.hasHtml,
              })),
            }
          : x,
      ),
    }));
  }
  return reaggregate(shipmentId);
}

// ---------------------------------------------------------------------------
// Tổng hợp + đối chiếu
// ---------------------------------------------------------------------------

export async function reaggregate(shipmentId: string, options: { autoSelect?: boolean } = {}): Promise<Shipment> {
  const repo = getShipmentRepo();
  const s0 = await repo.get(shipmentId);
  if (!s0) throw new Error("Không tìm thấy chuyến tàu");
  const ctx = await buildContext(s0.templateId);
  return mutateShipment(shipmentId, (s) => {
    const files = options.autoSelect ? autoSelectActive(s.files, s.extractedData.instances, ctx.ports) : s.files;
    const sheets = aggregate(s.extractedData.instances, files, s.extractedData.sheets, ctx);
    const result = crosscheck(s.extractedData.instances, files, sheets, ctx, s.resolvedValues);
    const anyExtracted = s.extractedData.instances.length > 0;
    return {
      ...s,
      files,
      extractedData: { ...s.extractedData, sheets },
      discrepancies: result.discrepancies,
      status: s.status === "draft" && anyExtracted ? "extracted" : s.status,
    };
  });
}

export async function setPageActive(shipmentId: string, fileId: string, page: number, active: boolean): Promise<Shipment> {
  await mutateShipment(shipmentId, (s) => {
    const target = s.files.find((f) => f.fileId === fileId)?.pages.find((p) => p.page === page);
    // Crew list / ship's store chỉ dùng MỘT bản: bật bản này thì tắt các bản cùng loại
    const exclusive = active && (target?.docType === "crew_list" || target?.docType === "ship_store") ? target.docType : null;
    return {
      ...s,
      files: s.files.map((f) => ({
        ...f,
        pages: f.pages.map((p) => {
          if (f.fileId === fileId && p.page === page) return { ...p, active, activeManual: true, activeNote: active ? "Người dùng bật" : "Người dùng tắt" };
          if (exclusive && p.docType === exclusive && p.active) return { ...p, active: false, activeManual: true, activeNote: "Tự tắt vì người dùng chọn bản khác" };
          return p;
        }),
      })),
    };
  });
  return reaggregate(shipmentId);
}

// ---------------------------------------------------------------------------
// Bóc tách nền
// ---------------------------------------------------------------------------

const g = globalThis as typeof globalThis & { __marinedocJobs?: Map<string, Promise<void>> };
g.__marinedocJobs ??= new Map();
const jobs = g.__marinedocJobs;

export function isExtractionRunning(shipmentId: string): boolean {
  return jobs.has(shipmentId);
}

function updatePage(s: Shipment, fileId: string, page: number, patch: Partial<PageInfo>): Shipment {
  return {
    ...s,
    files: s.files.map((f) => (f.fileId === fileId ? { ...f, pages: f.pages.map((p) => (p.page === page ? { ...p, ...patch } : p)) } : f)),
  };
}

/**
 * Đánh dấu trang cần bóc tách (tất cả trang chưa xong, hoặc một file/trang cụ thể khi "Thử lại"/"Bóc tách lại")
 * rồi chạy nền. Tiến độ: client polling GET /api/shipments/[id].
 */
export async function startExtraction(shipmentId: string, target?: { fileId?: string; page?: number; force?: boolean }): Promise<Shipment> {
  if (!getLlmConfig().configured) throw new Error(missingKeyMessage());
  const shipment = await mutateShipment(shipmentId, (s) => ({
    ...s,
    files: s.files.map((f) => {
      if (f.duplicateOf) return f;
      if (target?.fileId && f.fileId !== target.fileId) return f;
      return {
        ...f,
        pages: f.pages.map((p) => {
          if (target?.page !== undefined && p.page !== target.page) return p;
          const needs = target?.fileId || target?.force ? true : p.status !== "done";
          return needs && p.status !== "processing" ? { ...p, status: "pending" as const, error: undefined } : p;
        }),
      };
    }),
  }));
  if (!jobs.has(shipmentId)) {
    const job = runJob(shipmentId)
      .catch((err) => {
        console.error("[extract] job lỗi:", err instanceof Error ? err.message : err);
      })
      .finally(() => jobs.delete(shipmentId));
    jobs.set(shipmentId, job);
  }
  return shipment;
}

async function runJob(shipmentId: string): Promise<void> {
  const repo = getShipmentRepo();
  // Lặp đến khi không còn trang "pending" (người dùng có thể thêm trang trong lúc chạy)
  for (let round = 0; round < 20; round++) {
    const s = await repo.get(shipmentId);
    if (!s) return;
    const pending: Array<{ file: FileRecord; page: PageInfo }> = [];
    for (const f of s.files) {
      if (f.duplicateOf) continue;
      for (const p of f.pages) if (p.status === "pending") pending.push({ file: f, page: p });
    }
    if (pending.length === 0) break;
    // Tối đa 3 trang song song (deepseek.ts cũng giới hạn 3 lời gọi)
    let cursor = 0;
    const workers = Array.from({ length: Math.min(3, pending.length) }, async () => {
      while (cursor < pending.length) {
        const item = pending[cursor++];
        await processPage(shipmentId, item.file, item.page);
      }
    });
    await Promise.all(workers);
  }
  try {
    await reaggregate(shipmentId, { autoSelect: true });
  } catch (err) {
    console.error("[extract] tổng hợp lỗi, thử lại:", err instanceof Error ? err.message : err);
    await new Promise((r) => setTimeout(r, 1000));
    await reaggregate(shipmentId, { autoSelect: true });
  }
}

async function processPage(shipmentId: string, file: FileRecord, page: PageInfo): Promise<void> {
  await mutateShipment(shipmentId, (s) => updatePage(s, file.fileId, page.page, { status: "processing", error: undefined }));
  try {
    const text = await loadPageText(shipmentId, file.fileId, page.page);
    const needsImage = page.kind !== "text" && page.hasImage;
    let imageBase64 = needsImage ? await loadPageImageForModel(shipmentId, file.fileId, page.page, 0) : undefined;

    let cls = await classifyInstance({ kind: page.kind, text, imageBase64 });
    let rotation = page.rotation;
    if (imageBase64 && cls.rotation !== 0) {
      // Xoay ảnh lưu trữ bằng sharp rồi phân loại lại
      await rotateStoredPage(shipmentId, file.fileId, page.page, cls.rotation);
      rotation = (rotation + cls.rotation) % 360;
      imageBase64 = await loadPageImageForModel(shipmentId, file.fileId, page.page, 0);
      cls = await classifyInstance({ kind: page.kind, text, imageBase64 });
      if (cls.rotation !== 0) cls = { ...cls, rotation: 0 };
    }

    let instance: ExtractedInstance | null = null;
    if (cls.docType !== "unknown") {
      // Trang scan: OCR trên máy để AI có chữ chép đúng ký tự (ảnh đã xoay đúng chiều ở trên)
      let extractText = text;
      let extractKind = page.kind;
      let ocr = false;
      if (page.kind === "scanned" && page.hasImage && isOcrEnabled()) {
        try {
          const png = await getStorage().readFile(paths.pageImage(shipmentId, file.fileId, page.page));
          const result = await ocrImage(png);
          if (result.text.replace(/\s/g, "").length >= 30) {
            extractText = `=== TRANG ${page.page} ===\n${result.text}`;
            extractKind = "mixed";
            ocr = true;
            await getStorage().saveFile(paths.pageText(shipmentId, file.fileId, page.page), extractText);
          }
        } catch (err) {
          console.error("[ocr] lỗi, chỉ dùng ảnh:", err instanceof Error ? err.message : err);
        }
      }
      instance = await extractInstance({
        fileId: file.fileId,
        fileName: file.fileName,
        page: page.page,
        kind: extractKind,
        docType: cls.docType,
        text: extractText,
        imageBase64,
        ocr,
      });
    }

    await mutateShipment(shipmentId, (s) => {
      const instances = s.extractedData.instances.filter((i) => !(i.fileId === file.fileId && i.page === page.page));
      if (instance) instances.push(instance);
      const next = updatePage(s, file.fileId, page.page, {
        status: "done",
        docType: cls.docType,
        mode: cls.mode ?? null,
        port: cls.port ?? null,
        date: cls.date ?? null,
        voyageNo: cls.voyageNo ?? null,
        confidence: cls.confidence,
        rotation,
        title: page.title ?? cls.title ?? undefined,
        error: undefined,
      });
      return { ...next, extractedData: { ...next.extractedData, instances } };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await mutateShipment(shipmentId, (s) => updatePage(s, file.fileId, page.page, { status: "error", error: message }));
  }
}

/**
 * lib/extraction/verify.ts
 *
 * Xác minh bằng CODE giá trị AI trả về so với text nguồn (chép cơ học từ PDF/DOCX).
 *  - Có nguyên văn trong text nguồn (chuẩn hóa khoảng trắng / hoa-thường) -> verified.
 *  - Không có: với mã số, thử sửa bằng Levenshtein <= 1 theo token trong text gốc -> cờ "đã sửa theo text gốc".
 *  - Không thấy -> cờ vàng "không tìm thấy trong tài liệu".
 *  - Trang scan không có text: mọi ô cờ "đọc từ ảnh, cần kiểm tra".
 */

import type { ExtractedInstance, FieldValue, Flag, PageKind } from "@/lib/types";
import { stripAccents } from "@/lib/normalize";

export type VerifyStatus = "verified" | "corrected" | "notFound";

export function levenshtein(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    let rowMin = prev[0];
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
      rowMin = Math.min(rowMin, prev[j]);
    }
    if (rowMin > max) return max + 1;
  }
  return prev[b.length];
}

function norm(s: string): string {
  return s.replace(/[\s |]+/g, " ").trim().toUpperCase();
}

function normLoose(s: string): string {
  return stripAccents(s).replace(/[\s |]+/g, "").toUpperCase();
}

/** Mã số: số hộ chiếu, B/L, container, seal, giấy phép... (có cả chữ và số, không khoảng trắng dài). */
export function isCodeLike(value: string): boolean {
  const v = value.trim();
  return v.length >= 5 && v.length <= 30 && /\d/.test(v) && /^[A-Z0-9\-/.]+$/i.test(v);
}

export interface VerifyResult {
  status: VerifyStatus;
  corrected?: string;
}

export function verifyAgainstSource(raw: string, sourceText: string, codeLike: boolean): VerifyResult {
  const value = (raw ?? "").trim();
  if (!value) return { status: "verified" };
  const src = norm(sourceText);
  if (src.includes(norm(value))) return { status: "verified" };
  const loose = normLoose(sourceText);
  if (loose.includes(normLoose(value))) return { status: "verified" };

  if (codeLike) {
    const target = value.toUpperCase();
    const tokens = new Set(sourceText.toUpperCase().split(/[\s|,;:()]+/).filter((t) => Math.abs(t.length - target.length) <= 1 && t.length >= 4));
    const candidates: string[] = [];
    for (const t of tokens) {
      if (levenshtein(t, target, 1) <= 1) candidates.push(t);
    }
    if (candidates.length === 1) return { status: "corrected", corrected: candidates[0] };
  }
  return { status: "notFound" };
}

function addFlag(field: FieldValue, flag: Flag): void {
  field.flags = field.flags ?? [];
  if (!field.flags.some((f) => f.kind === flag.kind && f.message === flag.message)) field.flags.push(flag);
}

/**
 * Áp dụng xác minh cho mọi trường của một instance.
 * - kind "text": so với text nguồn.
 * - kind "scanned": cờ fromImage.
 * - kind "mixed": so với text nguồn; không thấy -> fromImage (text có thể chỉ một phần).
 */
/**
 * Trang scan: AI đọc ảnh, OCR trên máy là người kiểm tra độc lập.
 * Khớp OCR -> coi như đã xác minh. Lệch 1 ký tự -> tô vàng kèm "OCR đọc là ..." (không tự sửa: chưa biết bên nào đúng).
 * Không thấy -> "đọc từ ảnh, cần kiểm tra".
 */
/** Trường AI suy ra (không phải chép nguyên văn) -> không đối chiếu nguyên văn. */
const INFERRED_KEYS = new Set(["signerRole", "arrivalOrDeparture", "isHouseBl", "idDocumentType", "no"]);

function visitAll(instance: ExtractedInstance, visit: (f: FieldValue) => void): void {
  for (const [k, f] of Object.entries(instance.header)) if (!INFERRED_KEYS.has(k)) visit(f);
  for (const rows of Object.values(instance.tables)) for (const row of rows) for (const [k, f] of Object.entries(row)) if (!INFERRED_KEYS.has(k)) visit(f);
}

export function verifyWithOcr(instance: ExtractedInstance, ocrText: string): void {
  const visit = (field: FieldValue) => {
    const raw = field.raw ?? field.value;
    if (!raw || !raw.trim()) return;
    // Chỉ đối chiếu ô có chữ số (số hộ chiếu, ngày, số B/L, container...) – OCR đọc tên/chữ nhỏ không đáng tin
    if (!/\d/.test(raw)) return;
    const res = verifyAgainstSource(raw, ocrText, isCodeLike(raw));
    if (res.status === "verified") return;
    if (res.status === "corrected" && res.corrected) {
      addFlag(field, { kind: "needsConfirm", message: `AI đọc "${raw}" nhưng OCR đọc "${res.corrected}" – xem lại ảnh gốc` });
      return;
    }
    addFlag(field, { kind: "fromImage", message: "Đọc từ ảnh, OCR không xác nhận được – cần kiểm tra" });
  };
  visitAll(instance, visit);
}

export function verifyInstance(instance: ExtractedInstance, sourceText: string, kind: PageKind): void {
  const visit = (field: FieldValue) => {
    const raw = field.raw ?? field.value;
    if (!raw || !raw.trim()) return;
    if (kind === "scanned" || !sourceText.trim()) {
      addFlag(field, { kind: "fromImage", message: "Đọc từ ảnh, cần kiểm tra" });
      return;
    }
    const res = verifyAgainstSource(raw, sourceText, isCodeLike(raw));
    if (res.status === "verified") return;
    if (res.status === "corrected" && res.corrected) {
      if (field.value === raw) field.value = res.corrected;
      field.raw = res.corrected;
      addFlag(field, { kind: "corrected", message: `Đã sửa theo text gốc ("${raw}" → "${res.corrected}")` });
      return;
    }
    if (kind === "mixed") addFlag(field, { kind: "fromImage", message: "Không khớp với chữ nhận dạng được trên trang – AI đọc từ ảnh, cần kiểm tra" });
    else addFlag(field, { kind: "unverified", message: "Không tìm thấy nguyên văn trong tài liệu" });
  };
  visitAll(instance, visit);
}

/** Gắn cờ confidence thấp. */
export function flagLowConfidence(instance: ExtractedInstance, threshold = 0.8): void {
  const visit = (field: FieldValue) => {
    if (field.value && typeof field.confidence === "number" && field.confidence < threshold) {
      addFlag(field, { kind: "lowConfidence", message: `Độ tin cậy thấp (${Math.round(field.confidence * 100)}%)` });
    }
  };
  for (const f of Object.values(instance.header)) visit(f);
  for (const rows of Object.values(instance.tables)) for (const row of rows) for (const f of Object.values(row)) visit(f);
}

/** Đếm cơ học số dòng có vẻ là dòng dữ liệu (bắt đầu bằng số thứ tự) trong text dạng " | ". */
export function countNumberedRows(sourceText: string): number | undefined {
  const lines = sourceText.split("\n").filter((l) => l.includes("|"));
  if (lines.length === 0) return undefined;
  let count = 0;
  let expected = 1;
  for (const line of lines) {
    const first = line.split("|")[0].trim().replace(/[.)]$/, "");
    if (/^\d{1,3}$/.test(first) && parseInt(first, 10) === expected) {
      count++;
      expected++;
    }
  }
  return count > 0 ? count : undefined;
}

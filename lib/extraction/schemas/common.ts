/**
 * lib/extraction/schemas/common.ts
 *
 * Kiểu đặc tả trích xuất cho từng loại chứng từ + bộ dựng schema zod.
 * Mỗi trường AI trả về: { value, confidence, page, sourceText }.
 */

import { z } from "zod";

export interface FieldSpec {
  key: string;
  description: string;
}

export interface TableSpec {
  key: string;
  description: string;
  columns: FieldSpec[];
}

export interface DocSpec {
  docType: string;
  title: string;
  /** Hướng dẫn riêng cho loại chứng từ */
  instructions: string;
  header: FieldSpec[];
  tables: TableSpec[];
}

/** Chuỗi | số | null -> chuỗi | null (nguyên văn). */
const looseString = z
  .union([z.string(), z.number(), z.boolean(), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === null) return null;
    const s = String(v);
    return s.trim() === "" ? null : s;
  });

const looseNumber = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === null || v === "") return null;
    const n = typeof v === "number" ? v : parseFloat(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null;
  });

const looseInt = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === null || v === "") return null;
    const n = typeof v === "number" ? v : parseInt(v, 10);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  });

export const extractedFieldSchema = z.union([
  z
    .object({
      value: looseString,
      confidence: looseNumber,
      page: looseInt,
      sourceText: looseString,
    })
    .passthrough(),
  // Model đôi khi trả thẳng giá trị thay vì object
  z.union([z.string(), z.number(), z.null()]).transform((v) => ({
    value: v === null || v === "" ? null : String(v),
    confidence: null,
    page: null,
    sourceText: null,
  })),
]);

export type ExtractedField = { value: string | null; confidence: number | null; page: number | null; sourceText: string | null };

export function buildExtractionSchema(spec: DocSpec) {
  const headerShape: Record<string, z.ZodTypeAny> = {};
  for (const f of spec.header) headerShape[f.key] = extractedFieldSchema.optional().nullable();
  const tableShape: Record<string, z.ZodTypeAny> = {};
  for (const t of spec.tables) {
    const rowShape: Record<string, z.ZodTypeAny> = {};
    for (const c of t.columns) rowShape[c.key] = extractedFieldSchema.optional().nullable();
    tableShape[t.key] = z.array(z.object(rowShape).passthrough()).optional().nullable();
  }
  return z.object({
    header: z.object(headerShape).passthrough().optional().nullable(),
    tables: z.object(tableShape).passthrough().optional().nullable(),
    totalRowsStated: z.union([z.number(), z.string(), z.null()]).optional().nullable(),
  });
}

/** Ví dụ CẤU TRÚC (không chứa dữ liệu tàu thật hay giả) cho system prompt. */
export function buildStructureExample(spec: DocSpec): string {
  const field = { value: "<chuỗi nguyên văn hoặc null>", confidence: 0.0, page: 1, sourceText: "<đoạn text gốc chứa giá trị>" };
  const header: Record<string, unknown> = {};
  for (const f of spec.header.slice(0, 2)) header[f.key] = field;
  header["..."] = "các khóa header khác như trên";
  const tables: Record<string, unknown> = {};
  for (const t of spec.tables) {
    const row: Record<string, unknown> = {};
    for (const c of t.columns.slice(0, 2)) row[c.key] = field;
    row["..."] = "các cột khác như trên";
    tables[t.key] = [row];
  }
  return JSON.stringify({ header, tables, totalRowsStated: null }, null, 2);
}

export function describeSpec(spec: DocSpec): string {
  const lines: string[] = [];
  lines.push(`HEADER (khóa -> ý nghĩa):`);
  for (const f of spec.header) lines.push(`- ${f.key}: ${f.description}`);
  for (const t of spec.tables) {
    lines.push(`BẢNG "${t.key}": ${t.description}. Mỗi dòng gồm:`);
    for (const c of t.columns) lines.push(`  - ${c.key}: ${c.description}`);
  }
  return lines.join("\n");
}
